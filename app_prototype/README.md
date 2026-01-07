# Business Recipies
A simple, functional and smart way to figure out your production costs. Analyzes your recipies and finds out how much each of your products cost.

## How it works
1. Gather your recipie's data:
    - **Products**: name, cost, quantity
    - **Labor**: type, cost per hour, hours needed to create one unit of the product

## How to use it
Craft the request's body as shown here:
```json
{
    "products": [
        {
            "name": "Metal chair",
            "parts": [
                {
                    "name": "Metal bolt",
                    "quantity": 16,
                    "cost_per_unit": 0.4
                },
                {
                    "name": "Metal rods",
                    "quantity": 6,
                    "cost_per_unit": 2
                },
                {
                    "name": "Frame metal rods",
                    "quantity": 8,
                    "cost_per_unit": 1.8
                },
                {
                    "name": "Fiber",
                    "quantity": 2,
                    "cost_per_unit": 4
                }
            ],
            "labor": [
                {
                    "type": "Metal work",
                    "cost_per_hour": 12,
                    "hours_needed": 0.3
                },
                {
                    "type": "Paint job",
                    "cost_per_hour": 18,
                    "hours_needed": 1.2
                }
            ]
        }
    ]
}
```