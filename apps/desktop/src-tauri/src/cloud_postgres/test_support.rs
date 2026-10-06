//! Explicitly opted-in Neon integration fixtures. No writes to public schemas.
use sqlx::{
    ConnectOptions, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::str::FromStr;
use uuid::Uuid;

pub(crate) struct TestDatabase {
    pub pool: PgPool,
    pub schema: String,
    pub workspace_id: String,
    admin_pool: PgPool,
}

impl TestDatabase {
    pub async fn open() -> Self {
        let path = std::env::var("MACRO_TEST_ENV_FILE").unwrap_or_else(|_| {
            panic!("Set MACRO_TEST_ENV_FILE explicitly for the isolated Neon tests")
        });
        let entries = dotenvy::from_path_iter(path)
            .unwrap_or_else(|_| panic!("The explicit test configuration could not be read"));
        let mut unpooled = None;
        let mut alternate = None;
        for entry in entries {
            let (key, value) =
                entry.unwrap_or_else(|_| panic!("The explicit test configuration is invalid"));
            match key.as_str() {
                "DATABASE_URL_UNPOOLED" => unpooled = Some(value),
                "POSTGRES_URL_NON_POOLING" => alternate = Some(value),
                _ => {}
            }
        }
        let connection_string = unpooled
            .or(alternate)
            .unwrap_or_else(|| panic!("An unpooled test database connection is required"));
        let options = PgConnectOptions::from_str(&connection_string)
            .unwrap_or_else(|_| panic!("The test database connection is invalid"))
            .ssl_mode(PgSslMode::VerifyFull)
            .disable_statement_logging();
        let admin_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .unwrap_or_else(|_| panic!("The isolated test database is unavailable"));
        let schema = format!("macro_test_{}", Uuid::new_v4().simple());
        assert!(safe_schema(&schema));
        sqlx::query(&format!("CREATE SCHEMA {schema}"))
            .execute(&admin_pool)
            .await
            .unwrap_or_else(|_| panic!("The isolated test schema could not be created"));
        let schema_for_connect = schema.clone();
        let pool_result = PgPoolOptions::new()
            .max_connections(4)
            .after_connect(move |connection, _metadata| {
                let schema = schema_for_connect.clone();
                Box::pin(async move {
                    sqlx::query("SELECT set_config('search_path',$1,false)")
                        .bind(schema)
                        .execute(&mut *connection)
                        .await?;
                    Ok(())
                })
            })
            .connect_with(options)
            .await;
        let pool = match pool_result {
            Ok(pool) => pool,
            Err(_) => {
                remove_test_schema(&admin_pool, &schema).await;
                admin_pool.close().await;
                panic!("The isolated test schema could not be opened");
            }
        };
        if super::initialize(&pool).await.is_err() {
            pool.close().await;
            remove_test_schema(&admin_pool, &schema).await;
            admin_pool.close().await;
            panic!("The PostgreSQL test migrations failed");
        }
        let workspace_id = format!("test_{}", Uuid::new_v4().simple());
        if sqlx::query("INSERT INTO cloud_workspace(id,identity,revision) VALUES(1,$1,0)")
            .bind(&workspace_id)
            .execute(&pool)
            .await
            .is_err()
        {
            pool.close().await;
            remove_test_schema(&admin_pool, &schema).await;
            admin_pool.close().await;
            panic!("The isolated test identity could not be created");
        }
        Self {
            pool,
            schema,
            workspace_id,
            admin_pool,
        }
    }

    pub async fn close(self) {
        // Never accept a user-supplied schema/path as a cleanup target.
        assert!(
            safe_schema(&self.schema),
            "Refusing unsafe test schema cleanup"
        );
        self.pool.close().await;
        remove_test_schema(&self.admin_pool, &self.schema).await;
        self.admin_pool.close().await;
    }
}

async fn remove_test_schema(admin: &PgPool, schema: &str) {
    assert!(safe_schema(schema), "Refusing unsafe test schema cleanup");
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(admin)
        .await
        .unwrap_or_else(|_| panic!("The isolated test schema could not be removed"));
}

fn safe_schema(schema: &str) -> bool {
    schema.strip_prefix("macro_test_").is_some_and(|suffix| {
        suffix.len() == 32
            && suffix
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

#[test]
fn cleanup_accepts_only_generated_test_schema_identifiers() {
    assert!(safe_schema("macro_test_0123456789abcdef0123456789abcdef"));
    for name in [
        "public",
        "macro_private",
        "macro_test_",
        "macro_test_0123456789abcdef0123456789abcde\"",
        "macro_test_0123456789abcdef0123456789abcdef;DROP SCHEMA public",
    ] {
        assert!(!safe_schema(name));
    }
}
