from logging.config import fileConfig
import sys
from pathlib import Path
from dotenv import load_dotenv

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Load environment variables first
load_dotenv()

# Add src directory to path to import our models
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
from ops_model.base import Base

target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Import here to use our database URL logic
    from ops_model.base import _build_ops_database_url
    
    url = _build_ops_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Import here to use our database engine logic
    from ops_model.base import get_ops_engine, _build_ops_database_url
    
    connectable = get_ops_engine()
    database_url = _build_ops_database_url()
    is_sqlite = not database_url.startswith("postgresql://")

    with connectable.connect() as connection:
        # Configure database-specific options
        context_config = {
            "connection": connection,
            "target_metadata": target_metadata,
            "compare_type": True,
            "compare_server_default": True
        }
        
        # SQLite-specific configuration
        if is_sqlite:
            context_config["render_as_batch"] = True  # Use batch operations for SQLite
        
        context.configure(**context_config)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
