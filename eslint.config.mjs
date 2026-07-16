import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['content.js', 'inject.js', 'popup.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.browser,
                chrome: 'readonly'
            }
        }
    },
    {
        files: ['test/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser
            }
        }
    }
];
