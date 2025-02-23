import path from 'path';
import { Resolver, Logger, Common, PluginManager, Prompt, FileUtils } from 'rnv';
import { getAppFolderName } from './common';
import { parseProvisioningProfiles } from './provisionParser';

const {
    getAppFolder,
    getAppId,
    getAppTitle,
    getConfigProp,
    getFlavouredProp,
    addSystemInjects
} = Common;
const { fsExistsSync, fsMkdirSync, writeFileSync, fsWriteFileSync, writeCleanFile } = FileUtils;
const { doResolve } = Resolver;
const { chalk, logTask, logWarning } = Logger;
const { inquirerPrompt } = Prompt;
const { parsePlugins } = PluginManager;


export const parseXcodeProject = async (c) => {
    logTask('parseXcodeProject');
    const { platform } = c;
    // PROJECT
    c.runtime.xcodeProj = {};
    c.runtime.xcodeProj.provisioningStyle = getConfigProp(
        c,
        platform,
        'provisioningStyle',
        'Automatic'
    );
    c.runtime.xcodeProj.deploymentTarget = getConfigProp(
        c,
        platform,
        'deploymentTarget',
        '10.13'
    );
    c.runtime.xcodeProj.provisionProfileSpecifier = getConfigProp(
        c,
        platform,
        'provisionProfileSpecifier'
    );
    c.runtime.xcodeProj.codeSignIdentity = getConfigProp(
        c,
        platform,
        'codeSignIdentity',
        '-'
    );
    c.runtime.xcodeProj.systemCapabilities = getConfigProp(
        c,
        platform,
        'systemCapabilities'
    );
    c.runtime.xcodeProj.excludedArchs = getConfigProp(
        c,
        platform,
        'excludedArchs'
    );
    c.runtime.xcodeProj.runScheme = getConfigProp(c, platform, 'runScheme');
    c.runtime.xcodeProj.teamID = getConfigProp(c, platform, 'teamID');
    c.runtime.xcodeProj.id = getConfigProp(c, platform, 'id');
    c.runtime.xcodeProj.appId = getAppId(c, platform);

    if (
        c.runtime.xcodeProj.provisioningStyle !== 'Automatic'
        && !c.runtime.xcodeProj.provisionProfileSpecifier
    ) {
        const result = await parseProvisioningProfiles(c);

        let eligibleProfile;

        if (result?.eligable) {
            result.eligable.forEach((v) => {
                const bundleId = v.Entitlements['application-identifier'];

                if (
                    bundleId
                  === `${c.runtime.xcodeProj.teamID}.${c.runtime.xcodeProj.id}`
                ) {
                    eligibleProfile = v;
                }
            });
        }


        if (eligibleProfile) {
            const { autoFix } = await inquirerPrompt({
                type: 'confirm',
                name: 'autoFix',
                message: `Found following eligible provisioning profile on your system: ${eligibleProfile.Entitlements['application-identifier']}. Do you want ReNative to fix your app confing?`,
                warningMessage:
                    'No provisionProfileSpecifier configured in appConfig despite setting provisioningStyle to manual'
            });
            if (autoFix) {
                c.runtime.xcodeProj.provisionProfileSpecifier = eligibleProfile.Name;
                c.files.appConfig.config.platforms[platform].buildSchemes[
                    c.program.scheme
                ].provisionProfileSpecifier = eligibleProfile.Name;
                writeFileSync(
                    c.paths.appConfig.config,
                    c.files.appConfig.config
                );
            }
        } else {
            const w = 'Your build config has provisioningStyle set to manual but no provisionProfileSpecifier configured in appConfig and no available provisioning profiles availiable for';
            logWarning(
                `${w} ${c.runtime.xcodeProj.id}`
            );
        }
    }

    await _parseXcodeProject(c, platform);
};

const _parseXcodeProject = (c, platform) => new Promise((resolve) => {
    logTask('_parseXcodeProject');
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const xcode = require(doResolve('xcode'));
    // const xcode = require(`${c.paths.project.nodeModulesDir}/xcode`);
    const appFolder = getAppFolder(c);
    const appFolderName = getAppFolderName(c, platform);
    const projectPath = path.join(
        appFolder,
        `${appFolderName}.xcodeproj/project.pbxproj`
    );
    const xcodeProj = xcode.project(projectPath);
    xcodeProj.parse(() => {
        const {
            provisioningStyle,
            deploymentTarget,
            provisionProfileSpecifier,
            excludedArchs,
            codeSignIdentity,
            systemCapabilities,
            teamID,
            appId
        } = c.runtime.xcodeProj;

        if (c.runtime.xcodeProj.teamID) {
            xcodeProj.updateBuildProperty('DEVELOPMENT_TEAM', teamID);
        } else {
            xcodeProj.updateBuildProperty('DEVELOPMENT_TEAM', '""');
        }

        xcodeProj.addTargetAttribute(
            'ProvisioningStyle',
            provisioningStyle
        );
        xcodeProj.addBuildProperty('CODE_SIGN_STYLE', provisioningStyle);
        xcodeProj.updateBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', appId);

        xcodeProj.updateBuildProperty(
            'MACOSX_DEPLOYMENT_TARGET',
            deploymentTarget
        );

        if (provisionProfileSpecifier) {
            xcodeProj.updateBuildProperty(
                'PROVISIONING_PROFILE_SPECIFIER',
                `"${provisionProfileSpecifier}"`
            );
        }

        if (excludedArchs) {
            const tempExcludedArchs = [];

            if (typeof excludedArchs.forEach === 'function') {
                excludedArchs.forEach((arch) => {
                    if (typeof arch === 'string') tempExcludedArchs.push(arch);
                    if (typeof arch === 'object') {
                        Object.keys(arch).forEach((key) => {
                            xcodeProj.updateBuildProperty(
                                `"EXCLUDED_ARCHS[${key}]"`,
                                `"${arch[key]}"`
                            );
                        });
                    }
                });
            }

            if (tempExcludedArchs.length) {
                xcodeProj.updateBuildProperty(
                    'EXCLUDED_ARCHS',
                    `"${tempExcludedArchs.join(' ')}"`
                );
            }
        }


        xcodeProj.updateBuildProperty(
            'CODE_SIGN_IDENTITY',
            `"${codeSignIdentity}"`
        );

        // if (codeSignIdentity) {
        //     const bc = xcodeProj.pbxXCBuildConfigurationSection();
        //     const cs1 = 'CODE_SIGN_IDENTITY';
        //     const cs2 = '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"';
        //     for (const configName in bc) {
        //         const config = bc[configName];
        //         if ((runScheme && config.name === runScheme) || (!runScheme)) {
        //             if (config.buildSettings?.[cs1]) config.buildSettings[cs1] = `"${codeSignIdentity}"`;
        //             if (config.buildSettings?.[cs2]) config.buildSettings[cs2] = `"${codeSignIdentity}"`;
        //         }
        //     }
        // }

        if (systemCapabilities) {
            const sysCapObj = {};
            Object.keys(systemCapabilities).forEach((sk) => {
                const val = systemCapabilities[sk];
                sysCapObj[sk] = { enabled: val === true ? 1 : 0 };
            });
            // const var1 = xcodeProj.getFirstProject().firstProject.attributes.TargetAttributes['200132EF1F6BF9CF00450340'];
            xcodeProj.addTargetAttribute('SystemCapabilities', sysCapObj);
        }

        const xcodeprojObj1 = getConfigProp(
            c,
            c.platform,
            'xcodeproj'
        );

        if (xcodeprojObj1?.sourceFiles) {
            xcodeprojObj1.sourceFiles.forEach((v) => {
                const filePath = path.join(appFolder, v);
                if (fsExistsSync(filePath)) {
                    xcodeProj.addSourceFile(
                        filePath,
                        null,
                        '200132F21F6BF9CF00450340'
                    );
                } else {
                    logWarning(`You are trying to inject native file which does not exists: ${
                        chalk().red(filePath)
                    }. Skipping.`);
                }
            });
        }

        // PLUGINS
        parsePlugins(c, platform, (plugin, pluginPlat) => {
            const xcodeprojObj = getFlavouredProp(
                c,
                pluginPlat,
                'xcodeproj'
            );
            if (xcodeprojObj) {
                if (xcodeprojObj.resourceFiles) {
                    xcodeprojObj.resourceFiles.forEach((v) => {
                        xcodeProj.addResourceFile(path.join(appFolder, v));
                    });
                }
                if (xcodeprojObj.sourceFiles) {
                    xcodeprojObj.sourceFiles.forEach((v) => {
                        // const group = xcodeProj.hash.project.objects.PBXGroup['200132F21F6BF9CF00450340'];
                        xcodeProj.addSourceFile(
                            v,
                            null,
                            '200132F21F6BF9CF00450340'
                        );
                    });
                }
                if (xcodeprojObj.headerFiles) {
                    xcodeprojObj.headerFiles.forEach((v) => {
                        xcodeProj.addHeaderFile(
                            v,
                            null,
                            '200132F21F6BF9CF00450340'
                        );
                    });
                }
                if (xcodeprojObj.buildPhases) {
                    xcodeprojObj.buildPhases.forEach((v) => {
                        xcodeProj.addBuildPhase(
                            [],
                            'PBXShellScriptBuildPhase',
                            'ShellScript',
                            null,
                            {
                                shellPath: v.shellPath || '/bin/sh',
                                shellScript: v.shellScript,
                                inputPaths: v.inputPaths || [
                                    '"$(SRCROOT)/$(BUILT_PRODUCTS_DIR)/$(INFOPLIST_PATH)"'
                                ]
                            }
                        );
                    });
                }
                if (xcodeprojObj.frameworks) {
                    Object.keys(xcodeprojObj.frameworks).forEach((k) => {
                        let fPath;
                        let opts;
                        if (k.startsWith('./')) {
                            fPath = path.join(
                                appFolder,
                                k.replace('./', '')
                            );
                            opts = {
                                customFramework: true,
                                embed: true,
                                link: true
                            };
                        } else {
                            fPath = path.join(
                                'System/Library/Frameworks',
                                k
                            );
                            opts = {
                                embed: true
                            };
                        }
                        xcodeProj.addFramework(fPath, opts);
                    });
                }
                if (xcodeprojObj.buildSettings) {
                    Object.keys(xcodeprojObj.buildSettings).forEach((k) => {
                        xcodeProj.addToBuildSettings(
                            k,
                            xcodeprojObj.buildSettings[k]
                        );
                    });
                }
            }
        });

        fsWriteFileSync(projectPath, xcodeProj.writeSync());

        const appConfigFontsDir = c.paths.project.appConfigBase.fontsDir;
        const vectorIconsFontsDir = `${doResolve('react-native-vector-icons')}/Fonts`;

        let fontsDir;

        if (fsExistsSync(appConfigFontsDir)) fontsDir = appConfigFontsDir;
        else if (fsExistsSync(vectorIconsFontsDir)) fontsDir = vectorIconsFontsDir;
        // if neither appConfigs/base/fonts nor react-native-vector-icons/Fonts exists,
        // create empty folder `fonts` inside of appConfigs/base (so xcode could point to that empty folder and build wouldn't crash)
        else {
            fsMkdirSync(appConfigFontsDir);
            fontsDir = appConfigFontsDir;
        }

        const title = getAppTitle(c, platform);

        const injects = [
            { pattern: '{{RNV_INJECT_FONTS_DIR}}', override: fontsDir },
            { pattern: '{{TITLE}}', override: title },
        ];

        addSystemInjects(c, injects);

        writeCleanFile(
            projectPath,
            projectPath,
            injects, null, c
        );

        resolve();
    });
});
