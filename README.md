# PowerSync Agent Skills

Agent skills that help developers build applications with [PowerSync](https://powersync.com).

## Available Skills

| Skill                  | Description|
|----------------------|-----------------------|
| PowerSync |Comprehensive best practices for PowerSync Agent Skills. It includes all of the necessary topics from the SDKs, Service and debugging|

## Installation

### Skills.sh
```
npx skills add @powersync-ja/agent-skills
```

### Claude Code
```
/plugin marketplace add powersync/skills
```

## Usage

Once skills are installed, agents will automatically use relevant information when working on tasks relating to PowerSync. 

A few examples:
```
Migrate my sync rules to sync streams.
```
```
Write sync streams that download all user tasks and make sure the data is only available on the device for one week.
```
```
Update my list to use a reactive watch query so users can see updates in real-time.
```
```
Suggest sync streams based on my current schema, where the user should only sync projects for tenant that they belong to.
```
```
Add an upload endpoint to my backend API that accepts write operations from client applications.
```

These PowerSync skills follow the [Agent Skills](https://agentskills.io/) specification.