const form = document.querySelector('#auth-form');
const message = document.querySelector('#form-message');
const submitButton = form.querySelector('button[type="submit"]');
const mode = form.dataset.mode;

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';
  message.className = 'form-message';

  const data = Object.fromEntries(new FormData(form));
  submitButton.disabled = true;
  submitButton.querySelector('span:first-child').textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';

  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Try again.');
    window.location.assign('/home');
  } catch (error) {
    message.textContent = error.message || 'Could not reach the server. Try again.';
    message.classList.add('error');
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span:first-child').textContent = mode === 'signup' ? 'Create account' : 'Log in';
  }
});
