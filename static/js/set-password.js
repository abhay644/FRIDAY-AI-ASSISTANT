document.addEventListener('DOMContentLoaded', () => {
    const email = sessionStorage.getItem('google_email');
    const username = sessionStorage.getItem('google_username');
    
    if (!email) {
        window.location.href = '/login';
        return;
    }

    const userEmailSpan = document.getElementById('userEmail');
    const setPasswordForm = document.getElementById('setPasswordForm');
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.getElementById('submitBtn');
    
    userEmailSpan.textContent = email;
    if (username) {
        document.getElementById('username').value = username;
    }

    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    };

    setPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newUsername = setPasswordForm.username.value;
        const password = setPasswordForm.password.value;
        const confirmPassword = setPasswordForm.confirmPassword.value;

        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Setting up...';

        try {
            const response = await fetch('/api/auth/google/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email, 
                    username: newUsername, 
                    password 
                })
            });

            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                sessionStorage.removeItem('google_email');
                sessionStorage.removeItem('google_username');
                window.location.href = '/dashboard';
            } else {
                showError(data.error || 'Failed to set password');
            }
        } catch (error) {
            showError('Something went wrong. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Finish Setup';
        }
    });
});
