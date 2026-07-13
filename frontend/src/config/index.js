import * as urls from './urls.config';
import { company } from './company.config';
import * as thirdParty from './thirdParty.config';
import { CLARITY_PROJECT_ID } from './env.config';
import { getImageUrl, handleImageError } from './getImageUrl';

// Single aggregate export. Any component that needs a deployment value
// should `import config from '../config'` instead of reading
// `process.env.REACT_APP_*` or hardcoding a URL.
const config = { urls, company, thirdParty, clarityProjectId: CLARITY_PROJECT_ID, getImageUrl, handleImageError };

export default config;
export { urls, company, thirdParty, getImageUrl, handleImageError };
