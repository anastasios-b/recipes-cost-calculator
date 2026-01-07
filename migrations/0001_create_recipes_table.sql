-- Migration number: 0001 	 2025-01-07T00:00:00.000Z
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    weight REAL NOT NULL,
    length_unit REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    dimension_unit TEXT NOT NULL,
    yield_percentage REAL NOT NULL,
    waste_factor REAL NOT NULL,
    unit_of_measure TEXT NOT NULL,
    inventory_location TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL,
    cost_per_unit REAL NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_labor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id TEXT NOT NULL,
    type TEXT NOT NULL,
    cost_per_hour REAL NOT NULL,
    hours_needed REAL NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_recipe_parts_recipe_id ON recipe_parts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_labor_recipe_id ON recipe_labor(recipe_id);
