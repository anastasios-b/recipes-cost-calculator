const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data', 'database.json');

// Helper function to generate UUID v4
function uuidv4() {
    return crypto.randomUUID();
}

// Helper function to parse JSON body
function parseJSONBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

// Helper function to send JSON response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Helper function to handle CORS preflight
function handleCORS(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return true;
    }
    return false;
}

// Ensure data directory exists
async function ensureDataDirectory() {
    const dataDir = path.join(__dirname, 'data');
    const oldDataFile = path.join(__dirname, 'data', 'recipes.json');
    
    try {
        await fs.mkdir(dataDir, { recursive: true });
        
        // Check if database.json exists
        try {
            await fs.access(DATA_FILE);
        } catch {
            // database.json doesn't exist, check if recipes.json exists to migrate
            try {
                await fs.access(oldDataFile);
                const oldData = await fs.readFile(oldDataFile, 'utf8');
                // Migrate data to database.json
                await fs.writeFile(DATA_FILE, oldData);
                console.log('Migrated data from recipes.json to database.json');
            } catch {
                // Neither file exists, initialize with empty array
                await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2));
            }
        }
    } catch (error) {
        console.error('Error setting up data directory:', error);
        process.exit(1);
    }
}

// Read recipes from file
async function readRecipes() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading recipes:', error);
        throw new Error('Failed to read recipes data');
    }
}

// Write recipes to file
async function writeRecipes(recipes) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(recipes, null, 2));
    } catch (error) {
        console.error('Error writing recipes:', error);
        throw new Error('Failed to save recipes data');
    }
}

// Validate recipe data
function validateRecipe(recipe) {
    const requiredFields = [
        'name', 'weight', 'dimensions', 'yield_percentage', 
        'waste_factor', 'unit_of_measure', 'inventory_location',
        'parts', 'labor'
    ];
    
    const missingFields = requiredFields.filter(field => !(field in recipe));
    if (missingFields.length > 0) {
        return { valid: false, message: `Missing required fields: ${missingFields.join(', ')}` };
    }

    // Validate dimensions
    const dims = recipe.dimensions;
    if (!dims || typeof dims !== 'object' || !dims.length || !dims.width || !dims.height || !dims.unit) {
        return { valid: false, message: 'Invalid dimensions object. Must include length, width, height, and unit' };
    }

    // Validate parts
    if (!Array.isArray(recipe.parts) || recipe.parts.some(part => !part.name || part.quantity === undefined || part.cost_per_unit === undefined)) {
        return { valid: false, message: 'Invalid parts array. Each part must have name, quantity, and cost_per_unit' };
    }

    // Validate labor
    if (!Array.isArray(recipe.labor) || recipe.labor.some(labor => !labor.type || labor.cost_per_hour === undefined || labor.hours_needed === undefined)) {
        return { valid: false, message: 'Invalid labor array. Each labor item must have type, cost_per_hour, and hours_needed' };
    }

    return { valid: true };
}

// Validate partial recipe data for updates
function validatePartialRecipe(recipe) {
    // If dimensions are provided, validate them
    if (recipe.dimensions !== undefined) {
        const dims = recipe.dimensions;
        if (dims && (typeof dims !== 'object' || !dims.length || !dims.width || !dims.height || !dims.unit)) {
            return { valid: false, message: 'Invalid dimensions object. Must include length, width, height, and unit' };
        }
    }

    // If parts are provided, validate them
    if (recipe.parts !== undefined) {
        if (!Array.isArray(recipe.parts) || recipe.parts.some(part => !part.name || part.quantity === undefined || part.cost_per_unit === undefined)) {
            return { valid: false, message: 'Invalid parts array. Each part must have name, quantity, and cost_per_unit' };
        }
    }

    // If labor is provided, validate it
    if (recipe.labor !== undefined) {
        if (!Array.isArray(recipe.labor) || recipe.labor.some(labor => !labor.type || labor.cost_per_hour === undefined || labor.hours_needed === undefined)) {
            return { valid: false, message: 'Invalid labor array. Each labor item must have type, cost_per_hour, and hours_needed' };
        }
    }

    // Validate numeric fields if provided
    if (recipe.weight !== undefined && (typeof recipe.weight !== 'number' || recipe.weight < 0)) {
        return { valid: false, message: 'Weight must be a positive number' };
    }

    if (recipe.yield_percentage !== undefined && (typeof recipe.yield_percentage !== 'number' || recipe.yield_percentage < 0 || recipe.yield_percentage > 100)) {
        return { valid: false, message: 'Yield percentage must be a number between 0 and 100' };
    }

    if (recipe.waste_factor !== undefined && (typeof recipe.waste_factor !== 'number' || recipe.waste_factor < 0 || recipe.waste_factor >= 1)) {
        return { valid: false, message: 'Waste factor must be a number between 0 and 1' };
    }

    return { valid: true };
}

// Calculate detailed cost breakdown for a recipe
function calculateRecipeCost(recipe) {
    if (!recipe) {
        throw new Error('Recipe is required for cost calculation');
    }

    // Calculate parts cost
    const partsCost = recipe.parts.reduce((total, part) => {
        return total + (part.quantity * part.cost_per_unit);
    }, 0);

    // Calculate labor cost
    const laborCost = recipe.labor.reduce((total, job) => {
        return total + (job.hours_needed * job.cost_per_hour);
    }, 0);

    const subtotal = partsCost + laborCost;
    const costWithWaste = subtotal / (1 - (recipe.waste_factor || 0));
    const wasteAmount = costWithWaste - subtotal;

    return {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        cost_summary: {
            subtotal: subtotal,
            waste_factor: recipe.waste_factor,
            waste_amount: wasteAmount,
            total: costWithWaste,
            currency: 'USD',
            unit_of_measure: recipe.unit_of_measure || 'piece'
        }
    };
}

// Route handler
async function handleRequest(req, res) {
    // Handle CORS preflight
    if (handleCORS(req, res)) {
        return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const method = req.method;
    const pathname = parsedUrl.pathname;

    try {
        // Serve index.html for root route
        if (method === 'GET' && pathname === '/') {
            try {
                const indexPath = path.join(__dirname, 'index.html');
                const indexContent = await fs.readFile(indexPath, 'utf8');
                res.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end(indexContent);
            } catch (error) {
                return sendJSON(res, 404, { error: 'index.html not found' });
            }
        }

        // Get cost summary for all recipes
        if (method === 'GET' && pathname === '/api/recipes/cost/summary') {
            const recipes = await readRecipes();
            const summary = recipes.map(recipe => {
                const cost = calculateRecipeCost(recipe);
                return {
                    recipe_id: recipe.id,
                    recipe_name: recipe.name,
                    total_cost: cost.cost_summary.total,
                    parts_cost: cost.parts.total,
                    labor_cost: cost.labor.total,
                    unit_of_measure: cost.cost_summary.unit_of_measure
                };
            });
            
            const grandTotal = summary.reduce((total, item) => total + item.total_cost, 0);
            
            return sendJSON(res, 200, {
                recipes: summary,
                totals: {
                    total_parts_cost: summary.reduce((sum, item) => sum + item.parts_cost, 0),
                    total_labor_cost: summary.reduce((sum, item) => sum + item.labor_cost, 0),
                    grand_total: grandTotal,
                    average_cost_per_recipe: summary.length > 0 ? grandTotal / summary.length : 0,
                    total_recipes: summary.length,
                    currency: 'USD'
                }
            });
        }

        // Get detailed cost breakdown for a recipe
        if (method === 'GET' && pathname.startsWith('/api/recipes/') && pathname.endsWith('/cost')) {
            const pathParts = pathname.split('/');
            if (pathParts.length >= 5) {
                const id = pathParts[3];
                const recipes = await readRecipes();
                const recipe = recipes.find(r => r.id === id);
                
                if (!recipe) {
                    return sendJSON(res, 404, { error: 'Recipe not found' });
                }

                const costBreakdown = calculateRecipeCost(recipe);
                return sendJSON(res, 200, costBreakdown);
            }
        }

        // Get all recipes
        if (method === 'GET' && pathname === '/api/recipes') {
            const recipes = await readRecipes();
            return sendJSON(res, 200, recipes);
        }

        // Get a single recipe by ID
        if (method === 'GET' && pathname.startsWith('/api/recipes/')) {
            const pathParts = pathname.split('/');
            if (pathParts.length === 4) {
                const id = pathParts[3];
                
                const recipes = await readRecipes();
                const recipe = recipes.find(r => r.id === id);
                
                if (!recipe) {
                    return sendJSON(res, 404, { error: 'Recipe not found' });
                }
                
                return sendJSON(res, 200, recipe);
            }
        }

        // Create a new recipe
        if (method === 'POST' && pathname === '/api/recipes') {
            const body = await parseJSONBody(req);
            const validation = validateRecipe(body);
            if (!validation.valid) {
                return sendJSON(res, 400, { error: validation.message });
            }

            const recipes = await readRecipes();
            const newRecipe = {
                id: uuidv4(),
                ...body,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            recipes.push(newRecipe);
            await writeRecipes(recipes);
            
            return sendJSON(res, 201, newRecipe);
        }

        // Update an existing recipe
        if (method === 'PUT' && pathname.startsWith('/api/recipes/')) {
            const pathParts = pathname.split('/');
            if (pathParts.length >= 4) {
                const id = pathParts[3];
                const body = await parseJSONBody(req);
                const validation = validatePartialRecipe(body);
                if (!validation.valid) {
                    return sendJSON(res, 400, { error: validation.message });
                }

                const recipes = await readRecipes();
                const index = recipes.findIndex(r => r.id === id);
                
                if (index === -1) {
                    return sendJSON(res, 404, { error: 'Recipe not found' });
                }

                const updatedRecipe = {
                    ...recipes[index],
                    ...body,
                    id: id, // Prevent ID change
                    updated_at: new Date().toISOString()
                };

                recipes[index] = updatedRecipe;
                await writeRecipes(recipes);
                
                return sendJSON(res, 200, updatedRecipe);
            }
        }

        // Delete a recipe
        if (method === 'DELETE' && pathname.startsWith('/api/recipes/')) {
            const pathParts = pathname.split('/');
            if (pathParts.length >= 4) {
                const id = pathParts[3];
                const recipes = await readRecipes();
                const filteredRecipes = recipes.filter(r => r.id !== id);
                
                if (filteredRecipes.length === recipes.length) {
                    return sendJSON(res, 404, { error: 'Recipe not found' });
                }

                await writeRecipes(filteredRecipes);
                return sendJSON(res, 204, null);
            }
        }

        // 404 for unknown routes
        sendJSON(res, 404, { error: 'Route not found' });

    } catch (error) {
        console.error('Error handling request:', error);
        sendJSON(res, 500, { error: 'Something went wrong!' });
    }
}

// Initialize and start the server
async function startServer() {
    await ensureDataDirectory();
    
    const server = http.createServer(handleRequest);
    
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log(`  GET    / (serves index.html)`);
        console.log(`  GET    /api/recipes`);
        console.log(`  GET    /api/recipes/:id`);
        console.log(`  POST   /api/recipes`);
        console.log(`  PUT    /api/recipes/:id`);
        console.log(`  DELETE /api/recipes/:id`);
        console.log(`  GET    /api/recipes/:id/cost`);
        console.log(`  GET    /api/recipes/cost/summary`);
    });
}

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});