import chalk from 'chalk';
import { isPlatformSupported } from './common';


const addPlatform = (platform, program, process) => {
    if (!isPlatformSupported(platform)) return;
    console.log('ADD_PLATFORM: ', cmdOption);
};

export { addPlatform };
