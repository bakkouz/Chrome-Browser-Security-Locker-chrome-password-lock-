// lock.js

// Ensure the password input field is focused after the page loads
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('pwdinput');

        if (passwordInput) {
        // Attempt to focus immediately
        passwordInput.focus();
        console.log("Attempting to set focus on the password input field.");
          } 
});

// Handle unlocking logic
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('pwdinput');
    const unlockBtn = document.getElementById('unlock-btn');
    const messageDiv = document.getElementById('message');
    const attemptsDiv = document.getElementById('attempts');

    const MAX_ATTEMPTS = 3; // Maximum allowed attempts

    // Request initial attempts count from the background script
    chrome.runtime.sendMessage({ action: 'requestAttempts' }, (response) => {
        if (response && response.attemptsRemaining !== undefined) {
            updateAttemptsDisplay(response.attemptsRemaining);
        } else {
            updateAttemptsDisplay(MAX_ATTEMPTS); // Default to max attempts if no response
        }
    });

    // Update the attempts display
    function updateAttemptsDisplay(attempts) {
        if (attempts > 0) {
            attemptsDiv.textContent = `Attempts remaining: ${attempts}`;
            attemptsDiv.classList.remove('shutting-down');
        } else {
            attemptsDiv.textContent = `No attempts left. Shutting down chrome in 5 seconds...`;
            attemptsDiv.classList.add('shutting-down');
            unlockBtn.disabled = true;
            passwordInput.disabled = true;
        }
    }

    // Handle unlock button click
    unlockBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        messageDiv.textContent = ''; // Clear previous messages

        if (!password) {
            messageDiv.textContent = 'Please enter your password.';
            return;
        }

        // Disable the button while processing
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Checking...';

        try {
            const enteredPasswordHash = await hashPassword(password);

            // Send the entered password hash to the background script
            chrome.runtime.sendMessage({
                action: 'attemptUnlock',
                enteredPasswordHash: enteredPasswordHash
            }, (response) => {
                if (response && response.success) {
                    if (response.unlocked) {
                        messageDiv.textContent = 'Unlocked successfully!';
                        setTimeout(() => {
                            window.close(); // Close the current tab
                        }, 500);
                    } else {
                        updateAttemptsDisplay(response.attemptsRemaining);
                        if (response.shuttingDown) {
                            messageDiv.textContent = 'Incorrect password.';

                            // Send the shutdown message without a delay
                            chrome.runtime.sendMessage({ action: 'shutdownChrome' });
                        } else {
                            messageDiv.textContent = 'Incorrect password. Try again.';
                            unlockBtn.disabled = false; // Re-enable button
                            unlockBtn.textContent = 'Unlock';
                            passwordInput.value = ''; // Clear input
                            passwordInput.focus(); // Refocus input field
                        }
                    }
                } else {
                    messageDiv.textContent = 'An error occurred during unlock.';
                    unlockBtn.disabled = false;
                    unlockBtn.textContent = 'Unlock';
                }
            });
        } catch (error) {
            console.error("Error during password hashing:", error);
            messageDiv.textContent = 'An error occurred.';
            unlockBtn.disabled = false;
            unlockBtn.textContent = 'Unlock';
        }
    });

    // Allow pressing Enter to trigger the unlock button
    passwordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission
            unlockBtn.click(); // Trigger the unlock button click
        }
    });

    // Hashing utility function
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
});