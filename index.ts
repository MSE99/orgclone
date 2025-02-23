import { program } from 'commander'
import prompt from 'prompts';
import { Octokit } from '@octokit/rest'
import Fs from 'fs'
import Path from 'path'
import { execSync } from 'child_process'

const tokenFilename = 'token'


const saveTokenToDisk = (tk: string) => {
  Fs.writeFileSync(tokenFilename, tk)
}

const getTokenFromDisk = () => {
  try {
    return Fs.readFileSync(tokenFilename, 'utf-8')
  } catch (err) {
    return null
  }
}

const promptUserForToken = async () => {
  const response = await prompt({
    name: 'token',
    type: 'password',
    message: 'Please enter your github token',
  })

  return response.token as string | null
}

const getToken = async () => {
  const existingToken = getTokenFromDisk()
  if (!existingToken) {
    return await promptUserForToken()
  }
  return existingToken
}

const getOrg = async () => {
  const response = await prompt({
    name: 'orgName',
    type: 'text',
    message: 'Please enter the org name'
  })

  return response.orgName as string | null
}

const getTargetDirname = async () => {
  const response = await prompt({
    name: 'dirname',
    type: 'text',
    message: 'Please enter the directory you want to clone to'
  })

  return response.dirname as string | null
}

program.action(async () => {
  const token = await getToken()
  const org = await getOrg()

  if (!token || !org) {
    console.error('not enough info provided')
    process.exit(1)
  }

  saveTokenToDisk(token)

  const gh = new Octokit({
    auth: token,
  })

  const response = await gh.rest.repos.listForOrg({
    org,
    type: 'all',
    per_page: 150
  })
  const repos = response.data
  const sortedRepos = [...repos].sort((a, b) => Number(a.size || 0) - Number(b.size || 0))


  const repoDetails = sortedRepos.map(r => {
    return {
      sshUrl: r.ssh_url,
      name: r.name
    }
  })

  const dirname = await getTargetDirname()
  if (!dirname) {
    console.error('dirname is needed!')
    process.exit(1)
  }

  const cloneTo = Path.join(process.cwd(), dirname)
  if (!Fs.existsSync(cloneTo)) {
    Fs.mkdirSync(cloneTo)
  }

  for (const det of repoDetails) {
    try {
      execSync(`git clone ${det.sshUrl} ${Path.join(cloneTo, det.name)}`)
    } catch (err) {
      console.error('failed to clone ', det.sshUrl)
    }
  }
})

program.parse()
