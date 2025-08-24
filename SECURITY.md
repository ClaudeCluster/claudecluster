# Security Policy

## Supported Versions

ClaudeCluster is currently in pre-release development. Security updates will be provided for supported versions once releases begin.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

The ClaudeCluster team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

### How to Report a Security Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them privately using one of these methods:

1. **GitHub Security Advisories** (Recommended)
   - Go to the [Security tab](https://github.com/ClaudeCluster/claudecluster/security/advisories)
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Email**
   - Send details to: security@claudecluster.org
   - Include "ClaudeCluster Security" in the subject line

### What to Include

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Initial Response**: We will acknowledge receipt of your report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Regular Updates**: We will send updates on our progress at least every 10 business days
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### What to Expect

- We will respond to your report and work with you to understand the scope of the issue
- We will work on fixing the issue and will keep you informed of our progress
- Once the issue is resolved, we will publicly acknowledge your responsible disclosure (unless you prefer to remain anonymous)
- We may ask you to keep the issue confidential until we have released a fix

### Bug Bounty

ClaudeCluster does not currently have a formal bug bounty program. However, we deeply appreciate security researchers who help make ClaudeCluster safer for everyone.

### Security Best Practices for Users

When using ClaudeCluster:

- Keep your dependencies up to date
- Use strong, unique API keys and tokens
- Never commit API keys or sensitive configuration to version control
- Use the provided `.env.mcp.example` and `.mcp.json.example` templates
- Follow the principle of least privilege when configuring access
- Regularly audit your configuration files

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine the affected versions
2. Audit code to find any potential similar problems
3. Prepare fixes for all supported versions
4. Release new versions as soon as possible
5. Prominently announce the issue in the release notes

## Comments on This Policy

If you have suggestions on how this process could be improved, please submit a pull request or file an issue.

---

*This security policy is based on industry best practices and will be updated as the project evolves.*