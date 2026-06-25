import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db/connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "../db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

db.exec(schema);
console.log("Database initialized.");
