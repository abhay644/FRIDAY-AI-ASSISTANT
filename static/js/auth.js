document.addEventListener('DOMContentLoaded', () => {
    // Clear existing session to force login every time as requested
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.getElementById('submitBtn');

    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    };

    const setSubmitting = (isSubmitting) => {
        if (isSubmitting) {
            submitBtn.disabled = true;
            submitBtn.querySelector('span').textContent = 'Processing...';
        } else {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = loginForm ? 'Continue' : 'Create account';
        }
    };

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;

            setSubmitting(true);
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('username', data.username);
                    window.location.href = '/dashboard';
                } else {
                    showError(data.error || 'Invalid username or password');
                }
            } catch (error) {
                showError('Something went wrong. Please try again.');
            } finally {
                setSubmitting(false);
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = registerForm.username.value;
            const email = registerForm.email.value;
            const phone = registerForm.phone.value;
            const password = registerForm.password.value;

            setSubmitting(true);
            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, phone, password })
                });

                const data = await response.json();
                if (response.ok) {
                    // Automatically log in after registration
                    const loginRes = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const loginData = await loginRes.json();
                    if (loginRes.ok) {
                        localStorage.setItem('token', loginData.token);
                        localStorage.setItem('username', loginData.username);
                        window.location.href = '/dashboard';
                    } else {
                        window.location.href = '/';
                    }
                } else {
                    showError(data.error || 'Registration failed');
                }
            } catch (error) {
                showError('Something went wrong. Please try again.');
            } finally {
                setSubmitting(false);
            }
        });
    }

    // Google Login Logic
    const googleBtn = document.querySelector('.btn-google');
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            if (!window.GOOGLE_CLIENT_ID) {
                showError('Google Client ID not configured');
                return;
            }

            google.accounts.id.initialize({
                client_id: window.GOOGLE_CLIENT_ID,
                callback: handleGoogleResponse
            });

            google.accounts.id.prompt(); // Show one-tap
            // Also show the account chooser
            google.accounts.id.renderButton(
                document.querySelector('.btn-google'),
                { theme: 'outline', size: 'large', width: '100%' }
            );
        });
    }

    async function handleGoogleResponse(response) {
        try {
            const res = await fetch('/api/auth/google/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
            });

            const data = await res.json();
            if (res.ok) {
                if (data.status === 'success') {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('username', data.username);
                    window.location.href = '/dashboard';
                } else if (data.status === 'need_password') {
                    sessionStorage.setItem('google_email', data.email);
                    sessionStorage.setItem('google_username', data.username);
                    window.location.href = '/set-password';
                }
            } else {
                showError(data.error || 'Google login failed');
            }
        } catch (error) {
            showError('Something went wrong with Google login');
        }
    }
});
