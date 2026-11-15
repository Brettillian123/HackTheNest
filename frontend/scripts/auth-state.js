const profileButton = document.querySelector('#profile-button');
const profileName = document.querySelector('#profile-name');
const profileAvatar = document.querySelector('#profile-avatar');
const dropdown = document.querySelector('#profile-dropdown');
const logoutButton = document.querySelector('#logout-button');
const logoutDialog = document.querySelector('#logout-dialog');
const logoutMessage = document.querySelector('#logout-message');
const confirmLogout = document.querySelector('#confirm-logout');

function setMenuOpen(open) {
  dropdown.hidden = !open;
  profileButton.setAttribute('aria-expanded', String(open));
}

profileButton.addEventListener('click', () => setMenuOpen(dropdown.hidden));

document.addEventListener('click', event => {
  if (!event.target.closest('.profile-menu-wrap')) setMenuOpen(false);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setMenuOpen(false);
});

dropdown.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));

document.querySelector('#cancel-logout').addEventListener('click', () => logoutDialog.close());
logoutDialog.addEventListener('click', event => {
  if (event.target === logoutDialog) logoutDialog.close();
});

logoutButton.addEventListener('click', () => {
  setMenuOpen(false);
  logoutMessage.textContent = '';
  logoutDialog.showModal();
});

confirmLogout.addEventListener('click', async () => {
  confirmLogout.disabled = true;
  confirmLogout.textContent = 'Logging out…';
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not log out. Please try again.');
    window.location.assign('/home');
  } catch (error) {
    logoutMessage.textContent = error.message;
    confirmLogout.disabled = false;
    confirmLogout.textContent = 'Log out';
  }
});

fetch('/api/auth/me', { credentials: 'same-origin' })
  .then(response => response.ok ? response.json() : null)
  .then(result => {
    if (!result?.user) return;
    const { username } = result.user;
    profileName.textContent = username;
    profileAvatar.textContent = username.charAt(0).toUpperCase();
    profileButton.setAttribute('aria-label', `Open profile menu for ${username}`);
    document.querySelector('#dropdown-greeting').textContent = 'SIGNED IN AS';
    document.querySelector('#dropdown-username').textContent = username;
    dropdown.querySelectorAll('.guest-menu-item').forEach(link => { link.hidden = true; });
    logoutButton.hidden = false;
  })
  .catch(() => {});
