document.addEventListener('DOMContentLoaded', () => {
    const identifyForm = document.getElementById('identifyForm');
    const verifyForm = document.getElementById('verifyForm');
    const resetForm = document.getElementById('resetForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const otpInputsContainer = document.getElementById('otpInputs');
    
    let currentIdentifier = '';
    let currentType = ''; // email or mobile
    let resetToken = '';

    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
        setTimeout(() => errorMessage.style.display = 'none', 5000);
    };

    const showSuccess = (msg) => {
        successMessage.textContent = msg;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    };

    const showStep = (stepNumber) => {
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.getElementById(`step${stepNumber}`).classList.add('active');
    };

    // Step 1: Identify
    identifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = identifyForm.identifier.value.trim();
        
        const btn = document.getElementById('sendOtpBtn');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Sending...';

        try {
            const res = await fetch('/api/auth/otp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier })
            });
            const data = await res.json();
            
            if (res.ok) {
                currentIdentifier = identifier;
                currentType = data.type;
                document.getElementById('targetIdentifier').textContent = identifier;
                
                // Initialize OTP inputs (4 for email, 6 for mobile)
                const count = currentType === 'email' ? 4 : 6;
                otpInputsContainer.innerHTML = '';
                for (let i = 0; i < count; i++) {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.maxLength = 1;
                    input.className = 'otp-field';
                    input.dataset.index = i;
                    otpInputsContainer.appendChild(input);
                    
                    input.addEventListener('keyup', (ev) => {
                        if (ev.key >= 0 && ev.key <= 9) {
                            if (i < count - 1) otpInputsContainer.children[i+1].focus();
                        } else if (ev.key === 'Backspace') {
                            if (i > 0) otpInputsContainer.children[i-1].focus();
                        }
                    });
                }
                
                showStep(2);
                showSuccess(data.message);
            } else {
                showError(data.error || 'Failed to send OTP');
            }
        } catch (err) {
            showError('Network error. Please try again.');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Send Verification Code';
        }
    });

    // Step 2: Verify
    verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = Array.from(otpInputsContainer.children).map(i => i.value).join('');
        
        if (code.length < (currentType === 'email' ? 4 : 6)) {
            showError('Please enter the complete code');
            return;
        }

        const btn = document.getElementById('verifyOtpBtn');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Verifying...';

        try {
            const res = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: currentIdentifier, code })
            });
            const data = await res.json();
            
            if (res.ok) {
                resetToken = data.reset_token;
                showStep(3);
                showSuccess('Code verified! Please set your new password.');
            } else {
                showError(data.error || 'Invalid code');
            }
        } catch (err) {
            showError('Network error. Please try again.');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Verify Code';
        }
    });

    // Step 3: Reset
    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = resetForm.newPassword.value;
        const confirm = resetForm.confirmPassword.value;
        
        if (password !== confirm) {
            showError('Passwords do not match');
            return;
        }

        const btn = document.getElementById('finishResetBtn');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Updating...';

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset_token: resetToken, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                showSuccess('Password updated successfully! Redirecting to login...');
                setTimeout(() => window.location.href = '/', 2000);
            } else {
                showError(data.error || 'Failed to update password');
            }
        } catch (err) {
            showError('Network error. Please try again.');
        } finally {
            btn.disabled = false;
            btn.querySelector('span').textContent = 'Update Password';
        }
    });
    
    // Resend Btn
    document.getElementById('resendBtn').addEventListener('click', (e) => {
        e.preventDefault();
        identifyForm.dispatchEvent(new Event('submit'));
    });
});
