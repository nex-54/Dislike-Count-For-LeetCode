// Three places enumerate the extension's files -- manifest.json registers a
// script, build.sh ships it to the stores, eslint.config.mjs lints it with
// browser globals -- and missing one fails quietly. This checks they agree.
// Offline: no browser, no network, unlike the rest of the suite.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import eslintConfig from '../eslint.config.mjs';

const ROOT = resolve(import.meta.dirname, '..');
// Tooling config lives in the root but is not part of the extension.
const NOT_SHIPPED = new Set(['eslint.config.mjs']);

function read(file) {
    return readFileSync(join(ROOT, file), 'utf8');
}

function manifestFiles() {
    const manifest = JSON.parse(read('manifest.json'));
    // The manifest ships too, though nothing references it.
    const files = new Set(['manifest.json']);
    for (const script of manifest.content_scripts || []) {
        for (const js of script.js || []) {
            files.add(js);
        }
    }
    if (manifest.action && manifest.action.default_popup) {
        files.add(manifest.action.default_popup);
    }
    for (const icons of [manifest.icons, manifest.action && manifest.action.default_icon]) {
        for (const path of Object.values(icons || {})) {
            files.add(path);
        }
    }
    return files;
}

// popup.html pulls in popup.js, which the manifest itself never names.
function htmlRefs(file) {
    return [...read(file).matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(([, path]) => path)
        .filter((path) => !/^(https?:)?\/\//.test(path));
}

function buildFiles() {
    const line = read('build.sh').split('\n').find((l) => l.trimStart().startsWith('zip '));
    if (!line) {
        throw new Error('no zip command found in build.sh');
    }
    // Drop the command, its flags and the "$out" archive name.
    return new Set(line.trim().split(/\s+/).slice(1)
        .filter((arg) => !arg.startsWith('-') && !arg.includes('$')));
}

function globToRegExp(glob) {
    const source = glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\0')
        .replace(/\*/g, '[^/]*')
        .replace(/\0/g, '.*');
    return new RegExp(`^${source}$`);
}

function eslintCovers(file) {
    return eslintConfig.some((entry) =>
        (entry.files || []).some((glob) => globToRegExp(glob).test(file)));
}

function main() {
    const problems = [];
    const check = (label, failures, hint) => {
        if (failures.length === 0) {
            console.log(`ok - ${label}`);
            return;
        }
        problems.push(`${label}: ${failures.join(', ')} -- ${hint}`);
        console.error(`FAIL - ${label}: ${failures.join(', ')}`);
    };

    const shipped = manifestFiles();
    for (const file of [...shipped].filter((f) => f.endsWith('.html'))) {
        for (const ref of htmlRefs(file)) {
            shipped.add(ref);
        }
    }

    check('every registered file exists',
        [...shipped].filter((file) => !existsSync(join(ROOT, file))),
        'referenced by manifest.json or an extension page but missing from disk');

    const built = buildFiles();
    check('build.sh ships every registered file',
        [...shipped].filter((file) => !built.has(file)),
        'add it to the zip file list in build.sh, or it will not reach the stores');
    check('build.sh ships nothing unregistered',
        [...built].filter((file) => !shipped.has(file)),
        'listed in build.sh but nothing loads it; drop it from the zip');

    check('eslint.config.mjs covers every shipped script',
        [...shipped].filter((file) => file.endsWith('.js') && !eslintCovers(file)),
        'outside the files globs a script lints against bare defaults, without browser or chrome globals');

    const loadable = readdirSync(ROOT)
        .filter((name) => /\.(js|css|html)$/.test(name) && !NOT_SHIPPED.has(name));
    check('every root script is registered',
        loadable.filter((file) => !shipped.has(file)),
        'add it to manifest.json (and build.sh), or to NOT_SHIPPED here if it is tooling');

    if (problems.length > 0) {
        process.exit(1);
    }
    console.log('files test passed');
}

main();
