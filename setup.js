// setup.js

const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const setPasswordBtn = document.getElementById('set-password-btn');
const errorMessageDiv = document.getElementById('error-message');

// --- Hashing Utility (Duplicate or import from utils.js if preferred) ---
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
// --- End Hashing Utility ---


setPasswordBtn.addEventListener('click', async () => {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    errorMessageDiv.textContent = ''; // Clear previous errors

    if (!password || !confirmPassword) {
        errorMessageDiv.textContent = 'Please enter and confirm your password.';
        return;
    }

    if (password !== confirmPassword) {
        errorMessageDiv.textContent = 'Passwords do not match.';
        return;
    }

    if (password.length < 6) { // Simple minimum length check
         errorMessageDiv.textContent = 'Password must be at least 6 characters long.';
         return;
    }

    // Disable button while processing
    setPasswordBtn.disabled = true;
    setPasswordBtn.textContent = 'Setting...';

    try {
        const hashedPassword = await hashPassword(password);

        // Send message to background script to save the password
        chrome.runtime.sendMessage({
            action: 'setupPassword',
            hashedPassword: hashedPassword
        }, (response) => {
            if (response && response.success) {
                console.log("Setup successful, background script handling redirect.");
                // Background script will close this tab and open the lock screen
            } else {
                errorMessageDiv.textContent = 'Error setting password.';
                setPasswordBtn.disabled = false;
                setPasswordBtn.textContent = 'Set Password';
            }
        });
    } catch (error) {
        console.error("Hashing error:", error);
        errorMessageDiv.textContent = 'An error occurred during setup.';
        setPasswordBtn.disabled = false;
        setPasswordBtn.textContent = 'Set Password';
    }
});