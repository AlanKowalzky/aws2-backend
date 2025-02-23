// lambda/getProductsById.js
const products = [
    { id: "1", name: "Laptop", price: 3000 },
    { id: "2", name: "Smartphone", price: 1500 },
    { id: "3", name: "Headphones", price: 200 },
    { id: "4", name: "Tablet", price: 800 },
    { id: "5", name: "Smartwatch", price: 400 },
    { id: "6", name: "Camera", price: 1200 }
];

exports.handler = async (event) => {
    // Check if pathParameters exists
    if (!event || !event.pathParameters) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Missing product ID"
            })
        };
    }

    // Check if id exists but is empty
    if (event.pathParameters.id === "") {
        return {
            statusCode: 404,
            body: JSON.stringify({
                message: "Product not found"
            })
        };
    }

    // Check if id is missing
    if (!event.pathParameters.id) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Missing product ID"
            })
        };
    }

    const product = products.find(p => p.id === event.pathParameters.id);

    if (!product) {
        return {
            statusCode: 404,
            body: JSON.stringify({
                message: "Product not found"
            })
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify(product)
    };
};
