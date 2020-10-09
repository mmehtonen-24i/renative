import { configurePlugins, overrideTemplatePlugins, resolvePluginDependants } from '../../core/pluginManager';
import { chalk, logTask, logInfo } from '../../core/systemManager/logger';
import { parseRenativeConfigs, fixRenativeConfigsSync,
    checkIsRenativeProject, configureRuntimeDefaults, generateRuntimeConfig } from '../../core/configManager/configParser';
import { applyTemplate, checkIfTemplateInstalled, configureEntryPoints, configureTemplateFiles } from '../../core/templateManager';
import { fsExistsSync, fsMkdirSync } from '../../core/systemManager/fileutils';
import { checkCrypto } from '../../core/systemManager/crypto';
import { checkAndMigrateProject } from '../../core/projectManager/migrator';
import { TASK_INSTALL, TASK_PROJECT_CONFIGURE, TASK_TEMPLATE_APPLY, TASK_APP_CONFIGURE, TASK_WORKSPACE_CONFIGURE, PARAMS } from '../../core/constants';
import { checkAndCreateProjectPackage, copyRuntimeAssets, cleanPlaformAssets } from '../../core/projectManager/projectParser';
import { executeTask } from '../../core/engineManager';


export const taskRnvProjectConfigure = async (c, parentTask, originTask) => {
    logTask('taskRnvProjectConfigure');

    if (c.paths.project.builds.dir && !fsExistsSync(c.paths.project.builds.dir)) {
        logInfo(`Creating folder ${c.paths.project.builds.dir}`);
        fsMkdirSync(c.paths.project.builds.dir);
    }
    await checkAndMigrateProject(c);
    await parseRenativeConfigs(c);
    await checkIsRenativeProject(c);
    await checkAndCreateProjectPackage(c);
    await executeTask(c, TASK_WORKSPACE_CONFIGURE, TASK_PROJECT_CONFIGURE, originTask);

    if (c.program.only && !!parentTask) {
        await configureRuntimeDefaults(c);
        await executeTask(c, TASK_APP_CONFIGURE, TASK_PROJECT_CONFIGURE, originTask);
        await generateRuntimeConfig(c);
        return true;
    }

    await checkIfTemplateInstalled(c);
    await fixRenativeConfigsSync(c);
    await executeTask(c, TASK_INSTALL, TASK_PROJECT_CONFIGURE, originTask);
    await checkCrypto(c, parentTask, originTask);
    await configureRuntimeDefaults(c);

    if (originTask !== TASK_TEMPLATE_APPLY) {
        await applyTemplate(c);
        await configureRuntimeDefaults(c);
        await executeTask(c, TASK_INSTALL, TASK_PROJECT_CONFIGURE, originTask);
        await executeTask(c, TASK_APP_CONFIGURE, TASK_PROJECT_CONFIGURE, originTask);
        // IMPORTANT: configurePlugins must run after appConfig present to ensure merge of all configs/plugins
        await resolvePluginDependants(c);
        await configurePlugins(c);
        await configureRuntimeDefaults(c);
        if (c.program.resetHard && !c.runtime.disableReset) {
            logInfo(
                `You passed ${chalk().white('-R')} argument. "${chalk().white('./platformAssets')}" will be cleaned up first`
            );

            await cleanPlaformAssets(c);
        }
        await copyRuntimeAssets(c);
        await configureEntryPoints(c);
        await configureTemplateFiles(c);
        await generateRuntimeConfig(c);
        await overrideTemplatePlugins(c);
    }

    return true;
};

export default {
    description: 'Configure current project',
    fn: taskRnvProjectConfigure,
    task: TASK_PROJECT_CONFIGURE,
    params: PARAMS.withBase(),
    platforms: [],
};
