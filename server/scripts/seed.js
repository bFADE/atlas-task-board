// Adds back any missing sample tasks. Nothing is deleted; your own (and edited sample) tasks are untouched.
import { insertSampleTasks, DB_PATH } from '../db.js';

const n = insertSampleTasks();
console.log(`Inserted ${n} sample tasks into ${DB_PATH}`);
