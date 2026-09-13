"""Seed an admin account and example gateway records for local development.

Usage:  python -m scripts.seed --admin you@example.com --password '<strong>'

Gateways created here are placeholders with status "offline": a real gateway
appears only when its agent registers itself.
"""

from __future__ import annotations

import argparse
import asyncio

from app.common.db import close_mongo, connect_to_mongo, ensure_indexes, get_db
from app.common.security import hash_password
from app.common.timeutil import utcnow

EXAMPLE_LOCATIONS = [
    ("jp-tok-01", "Japan", "JP", "Tokyo", "10.20.1.0/24"),
    ("sg-sin-01", "Singapore", "SG", "Singapore", "10.20.2.0/24"),
    ("in-bom-01", "India", "IN", "Mumbai", "10.20.3.0/24"),
    ("us-nyc-01", "United States", "US", "New York", "10.20.4.0/24"),
    ("de-fra-01", "Germany", "DE", "Frankfurt", "10.20.5.0/24"),
    ("gb-lon-01", "United Kingdom", "GB", "London", "10.20.6.0/24"),
    ("ca-tor-01", "Canada", "CA", "Toronto", "10.20.7.0/24"),
    ("au-syd-01", "Australia", "AU", "Sydney", "10.20.8.0/24"),
]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--with-placeholder-servers", action="store_true")
    args = parser.parse_args()

    await connect_to_mongo()
    await ensure_indexes()
    db = get_db()

    await db.users.update_one(
        {"email": args.admin.lower()},
        {
            "$set": {
                "password_hash": hash_password(args.password),
                "is_admin": True,
                "plan": "unlimited",
                "status": "active",
                "updated_at": utcnow(),
            },
            "$setOnInsert": {"email": args.admin.lower(), "created_at": utcnow()},
        },
        upsert=True,
    )
    print(f"admin ready: {args.admin}")

    if args.with_placeholder_servers:
        for gid, country, cc, city, subnet in EXAMPLE_LOCATIONS:
            await db.vpn_servers.update_one(
                {"gateway_id": gid},
                {
                    "$setOnInsert": {
                        "gateway_id": gid,
                        "name": gid.upper(),
                        "country": country,
                        "country_code": cc,
                        "city": city,
                        "vpn_subnet": subnet,
                        "endpoint_host": "",
                        "listen_port": 51820,
                        "public_key": "",
                        "agent_url": "",
                        "agent_secret": "",
                        "capacity": 250,
                        "status": "offline",
                        "created_at": utcnow(),
                    }
                },
                upsert=True,
            )
        print(f"{len(EXAMPLE_LOCATIONS)} placeholder locations created (status=offline)")

    await close_mongo()


if __name__ == "__main__":
    asyncio.run(main())
