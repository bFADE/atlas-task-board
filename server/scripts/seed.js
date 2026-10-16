// Re-inserts the sample tasks (existing sample tasks are replaced; your own tasks are untouched).
import { insertSampleTasks, removeSampleTasks, DB_PATH } from '../db.js';

removeSampleTasks();
const n = insertSampleTasks();
console.log(`Inserted ${n} sample tasks into ${DB_PATH}`);
