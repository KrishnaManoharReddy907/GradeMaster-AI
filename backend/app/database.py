import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

client: Optional[AsyncIOMotorClient] = None
db = None


async def connect_db():
    global client, db
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_uri)
    db = client.grademaster
    print("Connected to MongoDB")


async def close_db():
    global client
    if client:
        client.close()
        print("MongoDB connection closed")


def get_database():
    return db
