import { describe, it, expect } from "vitest";
import { shouldRedactEnvVar, redactConnectionString } from "../server/scanner/mcp-scanner";

describe("shouldRedactEnvVar", () => {
  describe("true positives — should redact", () => {
    const shouldRedact = [
      "SECRET_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "DATABASE_URL",
      "database_url",
      "Database_Url",
      "CONNECTION_STRING",
      "MONGO_URI",
      "POSTGRES_URI",
      "REDIS_URL",
      "MYSQL_URI",
      "API_KEY",
      "api_key",
      "STRIPE_SECRET_KEY",
      "AUTH_TOKEN",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GITHUB_TOKEN",
      "PASSWORD",
      "DB_PASSWORD",
      "PRIVATE_KEY",
      "WEBHOOK_SECRET",
      "AWS_ACCESS_KEY_ID",
      "CREDENTIALS",
      "OAUTH_CLIENT_SECRET",
    ];

    for (const name of shouldRedact) {
      it(`redacts ${name}`, () => {
        expect(shouldRedactEnvVar(name)).toBe(true);
      });
    }
  });

  describe("false positives — should NOT redact", () => {
    const shouldNotRedact = [
      "KEYBOARD_LAYOUT",
      "KEY_REPEAT_RATE",
      "TOKEN_LIMIT",
      "TOKEN_COUNT",
      "TOKENIZER_PATH",
      "MONKEY_PATCH",
      "KEYNOTE_PATH",
      "NODE_ENV",
      "PORT",
      "HOST",
      "LOG_LEVEL",
      "DEBUG",
      "PATH",
      "HOME",
      "LANG",
    ];

    for (const name of shouldNotRedact) {
      it(`does NOT redact ${name}`, () => {
        expect(shouldRedactEnvVar(name)).toBe(false);
      });
    }
  });
});

describe("redactConnectionString", () => {
  it("redacts postgres credentials", () => {
    expect(redactConnectionString("postgres://admin:s3cret@db.host:5432/mydb"))
      .toBe("postgres://[REDACTED]@db.host:5432/mydb");
  });

  it("redacts mongodb+srv credentials", () => {
    expect(redactConnectionString("mongodb+srv://user:pass@cluster.mongodb.net/db"))
      .toBe("mongodb+srv://[REDACTED]@cluster.mongodb.net/db");
  });

  it("redacts mysql credentials", () => {
    expect(redactConnectionString("mysql://root:password@localhost:3306/app"))
      .toBe("mysql://[REDACTED]@localhost:3306/app");
  });

  it("redacts redis credentials", () => {
    expect(redactConnectionString("redis://default:secret@redis.host:6379"))
      .toBe("redis://[REDACTED]@redis.host:6379");
  });

  it("leaves URL without credentials unchanged", () => {
    expect(redactConnectionString("postgres://db.host:5432/mydb"))
      .toBe("postgres://db.host:5432/mydb");
  });

  it("leaves plain string unchanged", () => {
    expect(redactConnectionString("just a string"))
      .toBe("just a string");
  });

  it("leaves empty string unchanged", () => {
    expect(redactConnectionString(""))
      .toBe("");
  });
});

describe("full redaction pipeline", () => {
  it("applies correct redaction strategy per env var", () => {
    const env = {
      DATABASE_URL: "postgres://admin:secret@db:5432/app",
      NODE_ENV: "production",
      API_KEY: "test-fake-key-value",
      KEYBOARD_LAYOUT: "us",
      PORT: "3000",
    };
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (shouldRedactEnvVar(k)) {
        redacted[k] = /^\w+(\+\w+)?:\/\//.test(v) ? redactConnectionString(v) : "***";
      } else {
        redacted[k] = v;
      }
    }
    expect(redacted.DATABASE_URL).toBe("postgres://[REDACTED]@db:5432/app");
    expect(redacted.NODE_ENV).toBe("production");
    expect(redacted.API_KEY).toBe("***");
    expect(redacted.KEYBOARD_LAYOUT).toBe("us");
    expect(redacted.PORT).toBe("3000");
  });
});
