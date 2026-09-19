"""Tiny CLI for smoke-testing."""
from __future__ import annotations
import argparse
import json
import sys

from .memory import LanceMemory


def main():
    parser = argparse.ArgumentParser(prog="lance-memory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add")
    p_add.add_argument("text")
    p_add.add_argument("--project", required=True)
    p_add.add_argument("--user")
    p_add.add_argument("--agent")
    p_add.add_argument("--run")
    p_add.add_argument("--infer", action="store_true", default=True)
    p_add.add_argument("--no-infer", dest="infer", action="store_false")

    p_search = sub.add_parser("search")
    p_search.add_argument("query")
    p_search.add_argument("--project", required=True)
    p_search.add_argument("--user")
    p_search.add_argument("--agent")
    p_search.add_argument("--top-k", type=int, default=10)

    p_get = sub.add_parser("get-all")
    p_get.add_argument("--project", required=True)
    p_get.add_argument("--user")

    args = parser.parse_args()
    m = LanceMemory()

    if args.cmd == "add":
        result = m.add(args.text, project=args.project, user_id=args.user, agent_id=args.agent,
                       run_id=args.run, infer=args.infer)
        print(json.dumps(result, indent=2, default=str))
    elif args.cmd == "search":
        filters = {}
        if args.user:
            filters["user_id"] = args.user
        if args.agent:
            filters["agent_id"] = args.agent
        result = m.search(args.query, project=args.project, filters=filters, top_k=args.top_k)
        print(json.dumps(result, indent=2, default=str))
    elif args.cmd == "get-all":
        filters = {"user_id": args.user} if args.user else None
        result = m.get_all(project=args.project, filters=filters)
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    sys.exit(main())
