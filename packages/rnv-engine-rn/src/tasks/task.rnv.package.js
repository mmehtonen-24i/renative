import { TaskManager, Constants, Logger, PlatformManager, Common } from 'rnv';
import { SDKAndroid, SDKXcode } from '../sdks';

const { logErrorPlatform } = PlatformManager;
const { logTask } = Logger;
const {
    IOS,
    MACOS,
    ANDROID,
    ANDROID_TV,
    FIRE_TV,
    ANDROID_WEAR,
    TASK_PACKAGE,
    TASK_CONFIGURE,
    PARAMS
} = Constants;
const { getConfigProp } = Common;
const { packageBundleForXcode } = SDKXcode;
const { packageAndroid } = SDKAndroid;
const { executeOrSkipTask, shouldSkipTask } = TaskManager;

export const taskRnvPackage = async (c, parentTask, originTask) => {
    logTask('taskRnvPackage', `parent:${parentTask}`);
    const { platform } = c;

    await executeOrSkipTask(c, TASK_CONFIGURE, TASK_PACKAGE, originTask);

    if (shouldSkipTask(c, TASK_PACKAGE, originTask)) return true;

    const bundleAssets = getConfigProp(c, c.platform, 'bundleAssets');

    if (!bundleAssets) {
        return true;
    }

    switch (platform) {
        case IOS:
        case MACOS:
            return packageBundleForXcode(c);
        case ANDROID:
        case ANDROID_TV:
        case FIRE_TV:
        case ANDROID_WEAR:
            return packageAndroid(c);
        default:
            logErrorPlatform(c);
            return false;
    }
};

export default {
    description: 'Package source files into bundle',
    fn: taskRnvPackage,
    task: 'package',
    params: PARAMS.withBase(PARAMS.withConfigure()),
    platforms: [
        IOS,
        MACOS,
        ANDROID,
        ANDROID_TV,
        FIRE_TV,
        ANDROID_WEAR,
    ],
};
