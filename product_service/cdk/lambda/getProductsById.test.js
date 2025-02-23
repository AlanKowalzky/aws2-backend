// lambda/getProductsById.test.js
const { handler } = require('./getProductsById');

describe('getProductsById Lambda', () => {
    test('should return product when valid ID is provided', async () => {
        const event = {
            pathParameters: {
                id: "1"
            }
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body).toEqual({
            id: "1",
            name: "Laptop",
            price: 3000
        });
    });

    test('should return 404 when product is not found', async () => {
        const event = {
            pathParameters: {
                id: "999"
            }
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(body).toEqual({
            message: "Product not found"
        });
    });

    test('should handle missing path parameters', async () => {
        const event = {};

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(400);
        expect(body).toEqual({
            message: "Missing product ID"
        });
    });

    test('should handle empty id in path parameters', async () => {
        const event = {
            pathParameters: {
                id: ""
            }
        };

        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(404);
        expect(body).toEqual({
            message: "Product not found"
        });
    });
});
