chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.type === "sign_in") {
		chrome.identity.getAuthToken({
			interactive: true
		});
	}

	if (request.type === "sign_out") {
		chrome.identity.getAuthToken({
			'interactive': false
		}, function(token) {
			// Revoke the authentication token
			var signOutUrl = 'https://accounts.google.com/o/oauth2/revoke?token=' + token;
			fetch(signOutUrl);
			chrome.identity.removeCachedAuthToken({
				'token': token
			});
			console.log('Token revoked');
		});
	}

	if (request.type === "get_emails") {
		// Call the get_emails function with the retrieved auth token
		chrome.identity.getAuthToken({
			interactive: false
		}, function(token) {
			if (chrome.runtime.lastError) {
				console.log("Must sign-in to Gmail account first, sign in via the settings icon in the top right");
				return sendResponse("invalid token");
			};
			getEmails(token)
				.then(response => {
					parseEmailsData(response.token, response.data)
						.then(emails_dict => {
							sendResponse(emails_dict);
						})
				})
				.catch(error => {
					console.error(error);
				});
		});
		return true;
	}

	if (request.type === "get_sent_emails") {
		// Call the get_sent_emails function with the retrieved auth token
		chrome.identity.getAuthToken({
			interactive: false
		}, function(token) {
			if (chrome.runtime.lastError) {
				console.log("Must sign-in to Gmail account first, sign in via the settings icon in the top right");
				return sendResponse("invalid token");
			};
			getSentEmails(token)
				.then(response => sendResponse(response))
				.catch(error => {
					console.error(error);
				});
		});
		return true;
	}


});


// Call the Gmail API to get the user's emails
function getEmails(token) {
	// Set the Gmail API endpoint URL
	const endpoint = 'https://www.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=15';

	// Set the HTTP headers for the request
	const headers = new Headers({
		'Authorization': 'Bearer ' + token,
		'Content-Type': 'application/json'
	});

	// Send a GET request to the Gmail API endpoint and return the result as a Promise
	return fetch(endpoint, {
			method: 'GET',
			headers: headers
		})
		.then(response => response.json())
		.then(data => {
			return {
				token: token,
				data: data
			};
		})
		.catch(error => {
			console.error(error);
		});
}


function parseEmailsData(token, emails_data) {
	return new Promise((resolve, reject) => {
		let emails_dict = {};

		// Array to hold promises for each fetch call
		let fetchPromises = [];

		// Iterate through the list of emails and extract the email heading, date and body
		for (let email of emails_data.messages) {
			let email_id = email.id;

			// Create a new Promise for each fetch call and push it to the fetchPromises array
			fetchPromises.push(
				fetch('https://www.googleapis.com/gmail/v1/users/me/messages/' + email_id + '?format=full', {
					method: 'GET',
					headers: {
						'Authorization': 'Bearer ' + token,
						'Content-Type': 'application/json'
					}
				})
				.then(response => response.json())
				.then(data => {
					// Extract the email heading, date and body
					let email_heading = '';
					let email_date = '';
					let email_body = '';
					for (let header of data.payload.headers) {
						if (header.name === 'Subject') {
							email_heading = header.value;
						}
						if (header.name === 'Date') {
							email_date = new Date(header.value);
						}
						if (header.name === 'From') {
							email_body = header.value + '\n\n';
						}
					}
					email_body += data.snippet;

					// Add the email to an array
					let email = {
						heading: email_heading,
						date: email_date,
						body: email_body
					};
					emails_dict[email_heading] = email;
				})
				.catch(error => {
					console.error(error);
					reject(error);
				})
			);
		}

		// Wait for all promises to resolve and sort the emails_dict by date
		Promise.all(fetchPromises)
			.then(() => {
				let sorted_emails = Object.values(emails_dict).sort((a, b) => b.date - a.date);
				let sorted_dict = {};
				for (let email of sorted_emails) {
					sorted_dict[email.heading] = email.body;
				}
				resolve(sorted_dict);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function getSentEmails(token) {
	return new Promise((resolve, reject) => {
		// Fetch the last 100 sent emails
		fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:sent&maxResults=100', {
				headers: {
					'Authorization': 'Bearer ' + token,
					'Content-Type': 'application/json'
				}
			})
			.then(response => response.json())
			.then(data => {
				if (data.resultSizeEstimate === 0) {
					resolve("No sent emails")
				};
				const messages = data.messages;
				const promises = messages.map((message) => {
					// Fetch the message details
					return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + message.id + '?format=full', {
							headers: {
								'Authorization': 'Bearer ' + token,
								'Content-Type': 'application/json'
							}
						})
						.then(response => response.json())
						.then(data => {
							const charCount = data.payload.parts[0].body.size;
							const body = data.payload.parts[0].body.data;
							if (charCount === 0) {
								return {
									0: ''
								}
							};
							return {
								[charCount]: body
							};
						});
				});
				// Wait for all promises to resolve
				Promise.all(promises).then((results) => {
					resolve(results);
				});
			})
			.catch(error => {
				reject(error);
			});
	});
}