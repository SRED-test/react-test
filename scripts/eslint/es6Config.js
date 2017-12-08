const eslintrc = require('../../.eslintrc');

const ERROR = 2;

module.exports = Object.assign({}, eslintrc, {
  parser: 'espree',
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
      experimentalObjectRestSpread: true,
    },
  },
  rules: Object.assign({}, eslintrc.rules, {
    'no-var': ERROR,
  }),
});
