const { customType } = require("drizzle-orm/mysql-core");

const blob = customType({
	dataType() {
		return "blob";
	},
});

const longblob = customType({
	dataType() {
		return "longblob";
	},
});

module.exports = { blob, longblob };
