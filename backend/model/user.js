/**
 * Basic user data shape for the prototype.
 * Password is stored as plain text per the current request; do not use this for
 * real accounts until password hashing and secure storage are implemented.
 */
export class User {
  constructor({ id, username, email, password }) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.password = password;
  }
}
