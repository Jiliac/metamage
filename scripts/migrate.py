#!/usr/bin/env python3
"""
Database migration runner script.

Provides convenient commands for running Alembic migrations.
"""

import os
import sys
import subprocess
from pathlib import Path

# Add the src directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def run_alembic_command(cmd_args):
    """Run an alembic command."""
    # Change to project root for alembic
    project_root = Path(__file__).parent.parent
    original_cwd = os.getcwd()

    try:
        os.chdir(project_root)
        cmd = ["uv", "run", "alembic"] + cmd_args
        print(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, check=True)
        return result.returncode
    except subprocess.CalledProcessError as e:
        print(f"Command failed with exit code {e.returncode}")
        return e.returncode
    finally:
        os.chdir(original_cwd)


def create_migration(message):
    """Create a new migration."""
    return run_alembic_command(["revision", "--autogenerate", "-m", message])


def upgrade_database(revision="head"):
    """Upgrade database to revision."""
    return run_alembic_command(["upgrade", revision])


def downgrade_database(revision):
    """Downgrade database to revision."""
    return run_alembic_command(["downgrade", revision])


def show_current():
    """Show current revision."""
    return run_alembic_command(["current"])


def show_history():
    """Show migration history."""
    return run_alembic_command(["history", "--verbose"])


def show_heads():
    """Show current head revisions."""
    return run_alembic_command(["heads"])


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Database migration runner")
    subparsers = parser.add_subparsers(dest="command", help="Migration commands")

    # Create migration
    create_parser = subparsers.add_parser("create", help="Create new migration")
    create_parser.add_argument("message", help="Migration message")

    # Upgrade
    upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade database")
    upgrade_parser.add_argument(
        "revision", nargs="?", default="head", help="Target revision (default: head)"
    )

    # Downgrade
    downgrade_parser = subparsers.add_parser("downgrade", help="Downgrade database")
    downgrade_parser.add_argument("revision", help="Target revision")

    # Status commands
    subparsers.add_parser("current", help="Show current revision")
    subparsers.add_parser("history", help="Show migration history")
    subparsers.add_parser("heads", help="Show head revisions")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "create":
        sys.exit(create_migration(args.message))
    elif args.command == "upgrade":
        sys.exit(upgrade_database(args.revision))
    elif args.command == "downgrade":
        sys.exit(downgrade_database(args.revision))
    elif args.command == "current":
        sys.exit(show_current())
    elif args.command == "history":
        sys.exit(show_history())
    elif args.command == "heads":
        sys.exit(show_heads())
    else:
        parser.print_help()
        sys.exit(1)
