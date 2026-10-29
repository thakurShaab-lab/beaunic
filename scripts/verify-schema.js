/**
 * Read-only check that src/schema matches the live MySQL database:
 * tables, columns, SQL types, nullability, defaults, auto-increment,
 * primary keys, unique constraints, indexes and foreign keys.
 * Run: npm run db:verify
 */
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");
const { getTableConfig, MySqlTable } = require("drizzle-orm/mysql-core");
const schema = require("../src/schema");

async function main() {
	const conn = await mysql.createConnection({
		host: process.env.DB_HOST,
		port: Number(process.env.DB_PORT) || 3306,
		user: process.env.DB_USER,
		password: process.env.DB_PASSWORD,
		database: process.env.DB_NAME,
	});
	const q = async (sql) => (await conn.query(sql))[0];

	const dbTables = (await q(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`)).map((r) => r.TABLE_NAME);
	const cols = await q(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`);
	const stats = await q(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLS FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`);
	const fks = await q(`SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`);
	await conn.end();

	const tables = Object.values(schema).filter((v) => v instanceof MySqlTable).map((t) => getTableConfig(t));
	const byName = new Map(tables.map((t) => [t.name, t]));
	const errors = [];

	for (const name of dbTables) if (!byName.has(name)) errors.push(`missing table ${name}`);
	for (const t of tables) if (!dbTables.includes(t.name)) errors.push(`extra table ${t.name}`);

	for (const c of cols) {
		const t = byName.get(c.TABLE_NAME);
		if (!t) continue;
		const col = t.columns.find((x) => x.name === c.COLUMN_NAME);
		const where = `${c.TABLE_NAME}.${c.COLUMN_NAME}`;
		if (!col) { errors.push(`missing column ${where}`); continue; }
		const dbType = String(c.COLUMN_TYPE).toLowerCase().replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/, "$1").replace(/ zerofill/, "");
		const sType = col.getSQLType().toLowerCase().replace(/^(tinyint|smallint|mediumint|int|bigint)\(\d+\)/, "$1");
		const norm = (s) => s.replace(/\s+/g, "").replace(/^float$/, "float");
		if (norm(dbType) !== norm(sType)) errors.push(`type ${where}: db=${dbType} schema=${sType}`);
		if ((c.IS_NULLABLE === "NO") !== col.notNull) errors.push(`nullability ${where}`);
		if ((c.COLUMN_DEFAULT !== null) !== col.hasDefault && !String(c.EXTRA).includes("auto_increment")) errors.push(`default presence ${where}: db=${c.COLUMN_DEFAULT}`);
		if (c.COLUMN_DEFAULT !== null && col.default !== undefined && typeof col.default !== "object" && String(col.default) !== String(c.COLUMN_DEFAULT) && !(typeof col.default === "number" && col.default === Number(c.COLUMN_DEFAULT))) errors.push(`default value ${where}: db=${c.COLUMN_DEFAULT} schema=${col.default}`);
		if (String(c.EXTRA).includes("auto_increment") !== Boolean(col.autoIncrement)) errors.push(`autoincrement ${where}`);
	}
	for (const t of tables) {
		const dbColCount = cols.filter((c) => c.TABLE_NAME === t.name).length;
		if (dbColCount !== t.columns.length) errors.push(`column count ${t.name}: db=${dbColCount} schema=${t.columns.length}`);
	}

	for (const s of stats) {
		const t = byName.get(s.TABLE_NAME);
		if (!t) continue;
		const colsList = String(s.COLS).split(",");
		if (s.INDEX_NAME === "PRIMARY") {
			const pk = t.primaryKeys[0]?.columns.map((c) => c.name) ?? t.columns.filter((c) => c.primary).map((c) => c.name);
			if (pk.join(",") !== colsList.join(",")) errors.push(`primary key ${s.TABLE_NAME}: db=${colsList} schema=${pk}`);
			continue;
		}
		const idx = t.indexes.find((i) => i.config.name === s.INDEX_NAME);
		const uq = t.uniqueConstraints.find((u) => u.name === s.INDEX_NAME);
		if (!idx && !uq) { errors.push(`missing index ${s.TABLE_NAME}.${s.INDEX_NAME}`); continue; }
		const isUnique = uq ? true : Boolean(idx.config.unique);
		if (isUnique !== (Number(s.NON_UNIQUE) === 0)) errors.push(`index uniqueness ${s.TABLE_NAME}.${s.INDEX_NAME}`);
	}
	for (const t of tables) {
		const hasPk = stats.some((s) => s.TABLE_NAME === t.name && s.INDEX_NAME === "PRIMARY");
		const schemaPk = t.primaryKeys.length > 0 || t.columns.some((c) => c.primary);
		if (!hasPk && schemaPk) errors.push(`extra primary key ${t.name}`);
	}
	for (const fk of fks) {
		const t = byName.get(fk.TABLE_NAME);
		if (t && !t.foreignKeys.some((f) => f.getName() === fk.CONSTRAINT_NAME)) errors.push(`missing foreign key ${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`);
	}

	console.log(`DB tables: ${dbTables.length}, schema tables: ${tables.length}, DB columns: ${cols.length}, schema columns: ${tables.reduce((n, t) => n + t.columns.length, 0)}`);
	console.log(`DB indexes (incl. PK): ${stats.length}, foreign keys: ${fks.length}`);
	if (errors.length) {
		console.error(`${errors.length} mismatch(es):\n  ${errors.join("\n  ")}`);
		process.exit(1);
	}
	console.log("Schema matches database.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
