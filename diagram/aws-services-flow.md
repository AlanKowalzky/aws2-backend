# AWS Services Flow Diagram

```mermaid
flowchart TD
    subgraph "AWS Cloud"
        S3["S3 Bucket"] --> |CSV Files| ImportService["Import Service"]
        ImportService --> |Parse CSV| SQS["SQS Queue"]
        SQS --> |Trigger| ProductService["Product Service"]
        ProductService --> |Store Data| DynamoDB[("DynamoDB Tables")]
        ProductService --> |Publish Event| SNS["SNS Topic"]
        SNS --> |Notify| Subscribers["Subscribers"]
    end
    
    subgraph "DynamoDB Tables"
        ProductsTable["Products Table"]
        StocksTable["Stocks Table"]
    end
    
    DynamoDB --- ProductsTable
    DynamoDB --- StocksTable
    
    User["User"] --> |Upload CSV| S3
    User --> |API Requests| ProductService
```

## Flow Description

1. User uploads CSV files with product data to S3 bucket
2. Import Service processes the CSV files
3. Parsed product data is sent to SQS queue
4. Product Service is triggered by SQS events
5. Product Service creates new products in DynamoDB (Products and Stocks tables)
6. Product Service publishes notifications to SNS topic
7. Subscribers receive notifications about new products

This diagram represents the serverless architecture implemented in this project, showing the integration between various AWS services for product data processing.