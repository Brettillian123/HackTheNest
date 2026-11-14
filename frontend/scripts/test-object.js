const button = document.querySelector('#create-test-object');
const status = document.querySelector('#test-object-status');

button.addEventListener('click', async () => {
  button.disabled = true;
  button.querySelector('span:first-child').textContent = 'Saving…';
  status.className = '';
  status.textContent = 'Connecting to the database…';

  try {
    const response = await fetch('/api/test-objects', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not create test object.');

    status.className = 'success';
    status.textContent = `Saved! id: ${result.testObject.id} · randomString: ${result.testObject.randomString}`;
  } catch (error) {
    status.className = 'error';
    status.textContent = error.message || 'Could not reach the backend.';
  } finally {
    button.disabled = false;
    button.querySelector('span:first-child').textContent = 'Create test object';
  }
});
