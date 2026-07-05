import * as urls from './urls.config';
import * as thirdParty from './thirdParty.config';

// Single aggregate export. Any screen/util that needs a deployment value
// should `import config from '../config'` instead of reading
// `process.env.EXPO_PUBLIC_*` or hardcoding a URL.
const config = { urls, thirdParty };

export default config;
export { urls, thirdParty };
