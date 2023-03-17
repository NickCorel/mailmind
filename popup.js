// Get elements from 'popup.html'
const generateBtn = document.getElementById("generateBtn");
const summaryBtn = document.getElementById("summaryBtn");
const copyBtn = document.getElementById("copyBtn");
const getEmailsBtn = document.getElementById("getEmailsBtn");
const gmailSignIn = document.getElementById("gmailSignIn");
var outputText = document.getElementById("outputText");
var dropdown = document.getElementById("dropDownMenu");
var switchBtn = document.getElementById("switchBtn");
var emails_dict = {};
var conversation = [{}];

// Call main function after content is loaded
document.addEventListener("DOMContentLoaded", main);

function main() {
	// Check for valid Gmail session token.
	chrome.identity.getAuthToken({
		'interactive': false
	}, function(token) {
		if (!chrome.runtime.lastError) {
			gmailSignIn.innerHTML = 'Sign-out';
			console.log('Valid Gmail token found');
			getAndFormatSentEmails();
		}
	});

	// Retrieve checkbox value
	let checkboxValue = localStorage.getItem("checkboxValue");
	// Get value of checkbox button
	const checkbox = document.getElementById("checkboxBtn");

	if (checkboxValue === null || checkboxValue === undefined) {
		checkboxValue = checkbox.checked ? checkbox.value : null; // Use default value if localStorage is empty
	} else {
		checkbox.checked = checkboxValue === "true"; // Set switch to last saved value
	}

	// Save value to localStorage when switch is toggled
	checkbox.addEventListener("change", () => {
		localStorage.setItem("checkboxValue", checkbox.checked); // Save value to localStorage
	});

	generateBtn.addEventListener("click", function() {
		openAiApi(generateBtn);
	});

	summaryBtn.addEventListener("click", function() {
		openAiApi(summaryBtn);
	});

	// Copy output text to clipboard
	copyBtn.addEventListener("click", function() {
		const outputText = document.getElementById("outputText");
		outputText.select();
		document.execCommand("copy");
		// Show a notification or alert to indicate that the text has been copied to clipboard
	});

	// Send message to background.js when getEmails button is clicked
	getEmailsBtn.addEventListener("click", function() {
		// Change emails button to loading animation, ".innerHTML" method is causing background to change color slightly
		getEmailsBtn.className = 'fa fa-refresh fa-spin';
		getEmailsBtn.innerHTML = '<span></span>';
		// Send a message to the background script
		chrome.runtime.sendMessage({
				type: "get_emails"
			})
			.then(emails => {
				if (emails === "invalid token") {
					// Change emails button to 'x'
					getEmailsBtn.className = 'fa fa-times';
					return outputText.innerHTML = "Must sign-in to Gmail account first, sign in via the settings icon in the top right";
				}
				// Change emails button to tick
				getEmailsBtn.className = 'fa fa-check';
				generateDropdown(emails)
			});
	});

	// Send message to background.js when gmailSignIn button is clicked
	gmailSignIn.addEventListener("click", function() {
		if (gmailSignIn.textContent === "Sign-in to Gmail") {
			chrome.runtime.sendMessage({
				type: "sign_in"
			});
			gmailSignIn.innerHTML = 'Sign-out';
		} else {
			chrome.runtime.sendMessage({
				type: "sign_out"
			});
			gmailSignIn.innerHTML = 'Sign-in to Gmail';
		}
	});
}

async function openAiApi(button) {
	var buttonStr;
	var buttonLoading;

	if (button == summaryBtn) {
		buttonStr = 'Summarise';
		buttonLoading = 'Summarising'
	};
	if (button == generateBtn) {
		buttonStr = 'Generate';
		buttonLoading = 'Generating'
	};

	// Change the button to loading
	button.innerHTML = buttonLoading + ' <i class="fa fa-refresh fa-spin"></i>';

	var inputText = document.getElementById("inputText").value;
	var currentValueBody = selectedEmailBody(button);

	console.log(inputText.value, currentValueBody);

	// If no input return message
	if (typeof inputText.value === 'undefined' && currentValueBody === '') {
		outputText.textContent = "No Email selected or Additional Information provided.";
		button.innerHTML = buttonStr;
		return
	};

	const prompt = {
		"role": "user",
		"content": currentValueBody + "\nAdditional Information:\n" + inputText
	};

	if (button == generateBtn) {
		let checkboxValue = localStorage.getItem("checkboxValue");
		// Update conversation with prompt accordingly
		if (checkboxValue === 'true' && conversation !== 'less than 2000 characters') {
			await getAndFormatSentEmails().then(conversation.push(prompt));
		} else {
			conversation.length = 0;
			conversation = [prompt];
		}
	} else {
		conversation.length = 0;
		conversation = [prompt];
	}

	// Code to send the API request and display the response
	var xhr = new XMLHttpRequest();
	xhr.open("POST", "https://api.openai.com/v1/chat/completions", true);
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("Authorization", "Bearer YOUR_API_KEY");

	// Create data including prompt
	var data = JSON.stringify({
		"model": "gpt-3.5-turbo",
		"messages": conversation
	});

	// Code to send to OpenAI API
	xhr.onreadystatechange = function() {
		if (this.readyState === XMLHttpRequest.DONE) {
			if (this.status === 200) {
				var response = JSON.parse(this.responseText);
				button.innerHTML = buttonStr;
				outputText.textContent = response.choices[0].message.content.trim();
			} else if (this.status === 401) {
				button.innerHTML = buttonStr;
				outputText.textContent = "Your API Key is empty or invalid. Make sure to click the settings icon in the top-right and click 'find here'. Create a new API Key and copy-paste it into the extension.";
			} else if (this.status === 404) {
				button.innerHTML = buttonStr;
				outputText.textContent = "Not found: The requested resource could not be found.";
			} else if (this.status === 500) {
				button.innerHTML = buttonStr;
				outputText.textContent = "Internal server error: The server encountered an unexpected condition.";
			} else {
				var response = JSON.parse(this.responseText);
				button.innerHTML = buttonStr;
				outputText.textContent = response.error.message;
			}
		}
	};

	// Send the request
	xhr.send(data);
}

function generateDropdown(emails) {
	emails_dict = emails;

	// Clear any existing options in the dropdown
	dropdown.innerHTML = '';
	var customOption = document.createElement("option");
	const customOptionTxt = 'Select an Email';
	customOption.setAttribute("value", customOptionTxt);
	customOption.text = customOptionTxt;
	dropdown.appendChild(customOption);

	// Create and append new options for each email in the dictionary
	for (var key in emails) {
		if (emails.hasOwnProperty(key)) {
			var option = document.createElement("option");
			option.setAttribute("value", key);
			option.text = key;
			dropdown.appendChild(option);
		}
	}
}

function selectedEmailBody(button) {
	var respondEmailPrompt;
	if (button === generateBtn) {
		respondEmailPrompt = " \n Write a response to this Email: \n ";
	}
	if (button === summaryBtn) {
		respondEmailPrompt = " \n Summarise this Email: \n ";
	}
	var selectedOption = dropdown.options[dropdown.selectedIndex].value;
	if (selectedOption === "Select an Email" || dropdown.selectedIndex === 0) {
		if (inputText.value === '') {
			return ''
		};
		return respondEmailPrompt;
	}
	var selectedOptionBody = emails_dict[selectedOption];
	console.log(selectedOptionBody);
	return respondEmailPrompt + selectedOptionBody;
}

function formatSentEmails(sentEmails, emailSampleCharLength = 3000) {
	// Return out of the function if there are no emails to process
	if (sentEmails === "No sent emails") {
		return conversation = "less than 2000 characters";
	};

	// Declare conversation
	conversation.length = 0;
	conversation = [{
		"role": "system",
		"content": "You are an email response assistant. When I write 'Sample Email {int}: {email}' analyse my diction, sentiment, and greetings. The context of these emails is not important. Use my voice/style to generate email responses."
	}];

	// Create an object to store the message bodies by char count
	const emailBodiesCharLength = {};
	for (const email of sentEmails) {
		const charCount = Object.keys(email)[0];
		if (charCount === 0) continue;
		const body = atob(email[charCount].replace(/-/g, '+').replace(/_/g, '/'));
		emailBodiesCharLength[parseInt(charCount)] = body;
	}

	// Sort the email bodies by descending char count
	const sortedEmailBodies = Object.entries(emailBodiesCharLength)
		.map(([count, body]) => ({
			count,
			body
		}))
		.sort((a, b) => b.count - a.count);

	// Iterate through the email bodies until the sample length is reached
	let totalChars = 0;
	for (let i = 0; i < sortedEmailBodies.length; i++) {
		const email = sortedEmailBodies[i];
		const body = email.body;
		const charCount = parseInt(email.count);
		if (totalChars + charCount > emailSampleCharLength || body === '') {
			break;
		}
		conversation.push({
			role: 'assistant',
			content: `Sample Email ${i + 1}: \n${body}\n`
		});
		totalChars += charCount;
	}

	// If the total characters are less than 2000 there is not enough text for the model to learn from so we need disable this funciton
	if (totalChars < 2000) {
		return conversation = "less than 2000 characters";
	};

	return conversation;
}

function getAndFormatSentEmails() {
	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage({
			type: "get_sent_emails"
		}, (sentEmails) => {
			if (!sentEmails) {
				reject("No sent emails found");
			} else {
				formatSentEmails(sentEmails);
				if (conversation === "less than 2000 characters") {
					switchBtn.innerHTML = `<input type="checkbox" id="checkboxBtn" disabled>
                    <span class="slider round" id="sliderRound" style="background-color: #eb3654;">
                    <span class="tooltip-text"> Not enough sent emails to analyse </span>
                    </span>`;
				}
				resolve(sentEmails);
			}
		});
	});
}