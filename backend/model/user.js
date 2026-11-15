/** Basic user data shape. Persisted passwords are scrypt hashes. */
export class User {
  constructor({ id, username, email, password }) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.password = password;
  }
}
