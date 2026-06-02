const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function init() {
  const connectionConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };

  try {
    const connection = await mysql.createConnection(connectionConfig);
    console.log('Connected to MySQL server.');

    const dbName = process.env.DB_NAME || 'iqbaba';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`Database "${dbName}" checked/created.`);

    await connection.query(`USE \`${dbName}\``);

    // Read and execute database_schema.sql
    const schemaPath = path.resolve(__dirname, '../database_schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('Applying schema from database_schema.sql...');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Split schema into individual queries
      // This is a simple split, might need improvement for complex triggers/procs
      const queries = schema.split(';').filter(q => q.trim().length > 0);
      
      for (let query of queries) {
        await connection.query(query);
      }
      console.log('Schema applied successfully.');
    } else {
      console.log('database_schema.sql not found, skipping schema application.');
    }

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  }
}

init();
