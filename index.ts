import { program } from "commander";
import prompt from "prompts";
import { Octokit } from "@octokit/rest";
import Fs from "fs";
import Path from "path";
import OS from "os";
import { exec as execWithCB } from "child_process";
import { promisify } from "util";

const exec = promisify(execWithCB);

const availableParallelism = OS.availableParallelism();
const tokenFilename = "token";

const saveTokenToDisk = (tk: string) => {
    Fs.writeFileSync(tokenFilename, tk);
};

const getTokenFromDisk = () => {
    try {
        return Fs.readFileSync(tokenFilename, "utf-8");
    } catch (err) {
        return null;
    }
};

const promptUserForToken = async () => {
    const response = await prompt({
        name: "token",
        type: "password",
        message: "Please enter your github token",
    });

    return response.token as string | null;
};

const getToken = async () => {
    const existingToken = getTokenFromDisk();
    if (!existingToken) {
        return await promptUserForToken();
    }
    return existingToken;
};

const getOrg = async () => {
    const response = await prompt({
        name: "orgName",
        type: "text",
        message: "Please enter the org name",
    });

    return response.orgName as string | null;
};

const getTargetDirname = async () => {
    const response = await prompt({
        name: "dirname",
        type: "text",
        message: "Please enter the directory you want to clone to",
    });

    return response.dirname as string | null;
};

const chunkArr = <T>(list: T[], chunkSize: number) => {
    const result = [];
    let current = [];

    for (const item of list) {
        current.push(item);

        if (current.length === chunkSize) {
            result.push(current);
            current = [];
        }
    }

    if (current.length) {
        result.push(current);
        current = [];
    }

    return result;
};

const MAXIMUM_ATTEMPT_COUNT = 100;

const cloneRepos = async (
    entries: Array<{ sshUrl: string; name: string }>,
    cloneTo: string
) => {
    await Promise.all(
        entries.map(async (det) => {
            let attempCount = 0;
            let succeed = false;
            while (attempCount < MAXIMUM_ATTEMPT_COUNT) {
                attempCount++;
                try {
                    console.log(
                        `Attempting to Clone ${det.sshUrl}, Attempt Number: ${attempCount}`
                    );
                    await exec(
                        `git clone ${det.sshUrl} ${Path.join(
                            cloneTo,
                            det.name
                        )}`
                    );
                    succeed = true;
                    break;
                } catch (err) {
                    console.warn("failed to clone ", det.sshUrl, String(err));
                }
            }
            if (!succeed) {
                console.error(
                    `Attempted to clone the repo ${MAXIMUM_ATTEMPT_COUNT} and failed to clone`
                );
                Fs.appendFileSync(
                    Path.join(process.cwd(), "orgCloneErrors.log.txt"),
                    `\n\n ${new Date().toISOString()} Failed to clonse ${JSON.stringify(
                        det,
                        null,
                        4
                    )}`
                );
            }
        })
    );
};

program.action(async () => {
    const token = await getToken();
    const org = await getOrg();

    if (!token || !org) {
        console.error("not enough info provided");
        process.exit(1);
    }

    saveTokenToDisk(token);

    const gh = new Octokit({
        auth: token,
    });

    const response = await gh.rest.repos.listForOrg({
        org,
        type: "all",
        per_page: 150,
    });
    const repos = response.data;
    const sortedRepos = [...repos].sort(
        (a, b) => Number(a.size || 0) - Number(b.size || 0)
    );

    const repositoriesDetails = sortedRepos.map((r) => {
        return {
            sshUrl: r.ssh_url as string,
            name: r.name,
        };
    });

    const dirname = await getTargetDirname();
    if (!dirname) {
        console.error("dirname is needed!");
        process.exit(1);
    }

    const cloneTo = Path.join(process.cwd(), dirname);
    if (!Fs.existsSync(cloneTo)) {
        Fs.mkdirSync(cloneTo);
    }

    const firstEntry =
        repositoriesDetails.length > 0 ? [repositoriesDetails[0]] : [];
    const restOfEntries = repositoriesDetails.slice(1);
    const chunks = chunkArr(
        [...firstEntry, ...restOfEntries],
        availableParallelism
    );

    for (const chunk of chunks) {
        await cloneRepos(chunk, cloneTo);
    }
});

program.parse();
