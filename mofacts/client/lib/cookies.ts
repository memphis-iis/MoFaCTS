import { legacyInt, legacyTrim } from '../../common/underscoreCompat';

/* cookies.js - our small, simple wrapper around documment.cookies

See https://developer.mozilla.org/en-US/docs/Web/API/Document/cookie if you
are unfamiliar with the standard cookie interface in browsers.

The only dependency assumed is underscore and underscore mixins.

The funtionality in this module is currently limited and makes some pretty
strong assumptions about how you want to deal with cookies. Perhaps the main
assumption is that they should use a path of '/' and that they should have
their 'expires' value set. If you want something different, you should probably
think very strongly about using Meteor's Session instead of cookies.
*/

type CookieSource = { cookie: string };

const Cookie = {
  // Anything that supports reading cookieSource.cookie for all and setting
  // cookieSource.cookie to set a single cookie. (Mainly for mocking/testing)
  cookieSource: document as CookieSource,

  get(name: string): string {
    const allCookies = legacyTrim(this.cookieSource.cookie).split(';');
    const encodedName = encodeURIComponent(legacyTrim(name));

    const matchedCookie = allCookies
      .map((entry) => {
        const pos = entry.indexOf('=');
        return {
          name: legacyTrim(entry.substring(0, pos)),
          value: legacyTrim(entry.substring(pos + 1)),
        };
      })
      .find((cookie) => cookie.name === encodedName);

    const value = legacyTrim(matchedCookie?.value ?? '');
    return decodeURIComponent(value);
  },

  set(name: string, value: string, expireDays?: number): void {
    const encodedName = encodeURIComponent(legacyTrim(name));
    const encodedValue = encodeURIComponent(legacyTrim(value));

    const exp = new Date(
      new Date().getTime() +
      (legacyInt(expireDays, 1) * 24 * 60 * 60 * 1000),
    ).toUTCString();

    // Security: Add secure flags for cookies
    // Secure: only send over HTTPS (safe because app runs on HTTPS)
    // SameSite=Strict: prevent CSRF attacks
    this.cookieSource.cookie = `${encodedName}=${encodedValue}; path=/; expires=${exp}; Secure; SameSite=Strict`;
  },
};

export { Cookie };


