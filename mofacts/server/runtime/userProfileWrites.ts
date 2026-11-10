import { Meteor } from 'meteor/meteor';

// Accounts permits direct self-profile updates by default. All application profile
// writes use authenticated server methods, which are not subject to allow/deny.
// Deny the entire client update path so whole-profile replacement, $rename and
// nested modifiers cannot bypass the persona and account validators.
Meteor.users.deny({
  update: () => true,
});
