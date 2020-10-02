import semver from 'semver';
import path from 'path';
import inquirer from 'inquirer';
import { executeAsync, commandExistsSync } from './exec';
import { fsExistsSync, invalidatePodsChecksum, removeDirs } from './fileutils';
import { logTask, logWarning, logError, logInfo, logDebug } from './logger';
import { ANDROID, ANDROID_TV, ANDROID_WEAR } from '../constants';
import { doResolve } from '../resolve';


import { inquirerPrompt } from '../../cli/prompt';

export const listAndSelectNpmVersion = async (c, npmPackage) => {
    const templateVersionsStr = await executeAsync(
        c,
        `npm view ${npmPackage} versions`
    );
    const versionArr = templateVersionsStr
        .replace(/\r?\n|\r|\s|'|\[|\]/g, '')
        .split(',')
        .reverse();
    const { rnvVersion } = c;

    // filter greater versions than rnv
    const validVersions = versionArr
        .filter(version => semver.lte(version, rnvVersion))
        .map(v => ({ name: v, value: v }));
    if (validVersions[0].name === rnvVersion) {
        // mark the same versions as recommended
        validVersions[0].name = `${validVersions[0].name} (recommended)`;
    }

    const { inputTemplateVersion } = await inquirer.prompt({
        name: 'inputTemplateVersion',
        type: 'list',
        message: `What ${npmPackage} version to use?`,
        default: versionArr[0],
        choices: validVersions
    });

    return inputTemplateVersion;
};

export const checkIfProjectAndNodeModulesExists = async (c) => {
    logTask('checkIfProjectAndNodeModulesExists');

    if (c.paths.project.configExists && !fsExistsSync(c.paths.project.nodeModulesDir)) {
        c._requiresNpmInstall = false;
        logWarning(
            'Looks like your node_modules folder is missing. INSTALLING...'
        );
        await installPackageDependencies(c);
    }
};

export const installPackageDependencies = async (c, failOnError = false, skipJetifier = false) => {
    const customScript = c.buildConfig?.tasks?.install?.script;

    if (customScript) {
        logTask('installPackageDependencies');
        logInfo(`Found custom task for install: ${customScript}.`);
        await executeAsync(customScript);
        return true;
    }

    const isYarnInstalled = commandExistsSync('yarn') || doResolve('yarn', false);
    const yarnLockPath = path.join(c.paths.project.dir, 'yarn.lock');
    const npmLockPath = path.join(c.paths.project.dir, 'package-lock.json');
    let command = 'npm install';
    if (fsExistsSync(yarnLockPath)) {
        command = 'yarn';
    } else if (fsExistsSync(npmLockPath)) {
        command = 'npm install';
    } else if (isYarnInstalled) {
        const { packageManager } = await inquirerPrompt({
            type: 'list',
            name: 'packageManager',
            message: 'What package manager would you like to use?',
            choices: ['yarn', 'npm'],
            default: 'npm'
        });
        if (packageManager === 'yarn') command = 'yarn';
    }
    logTask('installPackageDependencies', `packageManager:(${command})`);

    try {
        await executeAsync(command);
        await invalidatePodsChecksum(c);
    } catch (e) {
        if (failOnError) {
            logError(e);
            return false;
        }
        logWarning(
            `${e}\n Seems like your node_modules is corrupted by other libs. ReNative will try to fix it for you`
        );
        try {
            await cleanNodeModules(c);
            await installPackageDependencies(c, true);
        } catch (npmErr) {
            logError(npmErr);
            return false;
        }
    }
    try {
        const plats = c.files.project.config?.defaults?.supportedPlatforms;
        if (
            Array.isArray(plats) && (plats.includes(ANDROID)
            || plats.includes(ANDROID_TV) || plats.includes(ANDROID_WEAR))
        ) {
            if (!skipJetifier && doResolve('jetifier')) {
                await executeAsync('npx jetify');
            }
        }
        return true;
    } catch (jetErr) {
        logError(jetErr);
        return false;
    }
};

export const cleanNodeModules = () => new Promise((resolve, reject) => {
    logTask('cleanNodeModules');
    const dirs = [
        'react-native-safe-area-view/.git',
        '@react-navigation/native/node_modules/react-native-safe-area-view/.git',
        'react-navigation/node_modules/react-native-safe-area-view/.git',
        'react-native-safe-area-view/.git',
        '@react-navigation/native/node_modules/react-native-safe-area-view/.git',
        'react-navigation/node_modules/react-native-safe-area-view/.git'
    ].reduce((acc, dir) => {
        const [_all, aPackage, aPath] = dir.match(/([^/]+)\/(.*)/);
        logDebug(`Cleaning: ${_all}`);
        const resolved = doResolve(aPackage, false);
        if (resolved) {
            acc.push(`${resolved}/${aPath}`);
        }
        return acc;
    }, []);
    removeDirs(dirs)
        .then(() => resolve())
        .catch(e => reject(e));
    // removeDirs([
    //     path.join(c.paths.project.nodeModulesDir, 'react-native-safe-area-view/.git'),
    //     path.join(c.paths.project.nodeModulesDir, '@react-navigation/native/node_modules/react-native-safe-area-view/.git'),
    //     path.join(c.paths.project.nodeModulesDir, 'react-navigation/node_modules/react-native-safe-area-view/.git'),
    //     path.join(c.paths.rnv.nodeModulesDir, 'react-native-safe-area-view/.git'),
    //     path.join(c.paths.rnv.nodeModulesDir, '@react-navigation/native/node_modules/react-native-safe-area-view/.git'),
    //     path.join(c.paths.rnv.nodeModulesDir, 'react-navigation/node_modules/react-native-safe-area-view/.git')
    // ]).then(() => resolve()).catch(e => reject(e));
});
