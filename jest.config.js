'use strict';

/** @type {import('jest').Config} */
module.exports = {
    testEnvironment:        'node',
    testMatch:              ['**/__tests__/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '/ui/'],
    verbose:                true,
};
