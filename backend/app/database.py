import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

client: Optional[AsyncIOMotorClient] = None
db = None


async def connect_db():
    global client, db
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB_NAME", "grademaster")
    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]
    print(f"Connected to MongoDB database '{db_name}'")


async def close_db():
    global client
    if client:
        client.close()
        print("MongoDB connection closed")


def get_database():
    return db
