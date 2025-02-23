import { INJECTABLE_RUNTIME_PROPS } from '../constants';
import { getEngineRunnerByPlatform } from '../engineManager';
import { isSystemWin } from '../systemManager/utils';
import {
    getRealPath,
} from '../systemManager/fileutils';
import { getConfigProp } from '../common';
import {
    logTask,
} from '../systemManager/logger';
import { loadPluginTemplates } from '../pluginManager';
import { parseRenativeConfigs } from '../configManager/index';


export const updateRenativeConfigs = async (c) => {
    await loadPluginTemplates(c);
    await parseRenativeConfigs(c);
    return true;
};

export const configureRuntimeDefaults = async (c) => {
    c.runtime.appId = c.files.project?.configLocal?._meta?.currentAppConfigId || null;
    // c.runtime.appConfigDir = c.files.project?.configLocal?._meta?.currentAppConfigDir || null;

    logTask('configureRuntimeDefaults', `appId:${c.runtime.appId}`);

    // TODO:
    // version
    // title
    c.runtime.currentEngine = c.runtime.enginesByPlatform?.[c.platform];
    c.runtime.currentPlatform = c.runtime.currentEngine?.platforms?.[c.platform];

    c.runtime.port = c.program.port
  || c.buildConfig?.defaults?.ports?.[c.platform]
  || c.runtime.currentPlatform?.defaultPort; //  PLATFORMS[c.platform]?.defaultPort;
    if (c.program.target !== true) {
        c.runtime.target = c.program.target
      || c.buildConfig?.defaultTargets?.[c.platform];
    } else c.runtime.target = c.program.target;
    c.runtime.scheme = c.program.scheme || 'debug';
    c.runtime.localhost = isSystemWin ? '127.0.0.1' : '0.0.0.0';
    c.runtime.timestamp = c.runtime.timestamp || Date.now();
    c.configPropsInjects = c.configPropsInjects || [];
    c.systemPropsInjects = c.systemPropsInjects || [];
    c.runtimePropsInjects = [];

    INJECTABLE_RUNTIME_PROPS.forEach((key) => {
        c.runtimePropsInjects.push({
            pattern: `{{runtimeProps.${key}}}`,
            override: c.runtime[key]
        });
    });
    if (c.buildConfig) {
        c.runtime.bundleAssets = getConfigProp(c, c.platform, 'bundleAssets', false);
        const { hosted } = c.program;
        c.runtime.hosted = (hosted || !c.runtime.scheme.bundleAssets) && c.runtime.currentPlatform?.isWebHosted;

        // c.runtime.devServer = `http://${ip.address()}:${c.runtime.port}`;
        if (c.buildConfig.defaults?.supportedPlatforms) {
            c.runtime.supportedPlatforms = c.buildConfig.defaults.supportedPlatforms.map((platform) => {
                const engine = getEngineRunnerByPlatform(c, platform);
                if (engine) {
                    const dir = engine.originalTemplatePlatformsDir;

                    let isConnected = false;
                    let isValid = false;
                    const pDir = c.paths.project.platformTemplatesDirs?.[platform];
                    if (pDir) {
                        isValid = true;
                        isConnected = pDir?.includes?.(getRealPath(c, dir));
                    }
                    const port = c.buildConfig.defaults?.[platform] || c.runtime.currentPlatform?.defaultPort;
                    return {
                        engine,
                        platform,
                        isConnected,
                        port,
                        isValid
                    };
                }
                return null;
            }).filter(v => v);
        }
    }
    return true;
};
