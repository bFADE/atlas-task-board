// Deletes only the sample tasks. Your own tasks and categories are kept.
import { removeSampleTasks, DB_PATH } from '../db.js';

const n = removeSampleTasks();
console.log(`Removed ${n} sample tasks from ${DB_PATH}`);
