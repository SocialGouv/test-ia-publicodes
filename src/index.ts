import "dotenv/config"
import OpenAI from "openai"
import Engine from "publicodes"
import * as readline from "node:readline/promises"
import rules from "./publicodes.json"

const SYSTEM_PROMPT = `Tu es un assistant, au ton sarcastique qui fait des petites blagues, en charge de déterminer le préavis de retraite de l'utilisateur.
Tu dois utiliser la fonction getNextQuestion mise à ta disposition pour récupérer chaque question à poser à l'utilisateur pour calculer son préavis de retraite.
Tu ne dois pas soumettre de questions autres que celles qui te sont renvoyée par la fonction getNextQuestion.
Commence la conversation par aller chercher la premiere question et soumets la à l'utilisateur.
Utilise la fonction getIDCC pour récupérer l'IDCC de la convention collective de l'utilisateur.`

// @ts-ignore
const engine = new Engine(rules)

const model = "gpt-3.5-turbo-0613"
const rl = readline.createInterface(process.stdin, process.stdout)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

function getTopMissingVariable(missingVariables) {
  let attributMax = null
  let scoreMax = -Infinity

  for (const attribut in missingVariables) {
    const score = missingVariables[attribut]
    if (score > scoreMax) {
      attributMax = attribut
      scoreMax = score
    }
  }

  return attributMax
}

// const params = Object.keys(rules)
//   .filter((rule) => rules[rule].question)
//   .reduce((properties, rule) => {
//     properties[rule] = ""
//     return properties
//   }, {})

// function getRulesProperties() {
//   return Object.keys(rules)
//     .filter((rule) => rules[rule].question)
//     .reduce((properties, rule) => {
//       properties[rule] = {
//         type: "string",
//         description: rules[rule].question,
//       }
//       return properties
//     }, {})
// }

// function getRulesRequired() {
//   return Object.keys(rules)
//     .filter((rule) => rules[rule].question)
//     .map((rule) => rule)
// }

// console.log(getRulesProperties())
// console.log(getRulesRequired())
// console.log(params)

function getIDCC(name) {
  console.log("CALL OF getIDCC", name)
  return "'IDCC1042'"
}

async function getNextQuestion(params = {}) {
  console.log("---> CALL OF getNextQuestion")

  const result = await engine
    .setSituation(
      Object.entries(params).reduce((p, param) => {
        if (param[1]) {
          if (
            param[0] === "contrat salarié . convention collective" ||
            param[0] ===
              "contrat salarié . convention collective . automobiles . catégorie professionnelle" ||
            param[0] ===
              "contrat salarié . convention collective . automobiles . catégorie professionnelle . agents de maîtrise . échelon"
          )
            p[param[0]] = `'${param[1]}'`
          else p[param[0]] = param[1]
        }
        return p
      }, {})
    )
    .evaluate("contrat salarié . préavis de retraite")

  // console.log("getNextQuestion", result)
  const missingVariable = getTopMissingVariable(result.missingVariables)
  // console.log("missingVariable", missingVariable)
  const nextQuestion = rules[missingVariable].question
  console.log("nextQuestion:", nextQuestion)
  return { nextQuestion, missingVariable }
}

const functions = [
  {
    name: "getIDCC",
    description:
      "Retourne l'IDCC en fonction d'un nom de convention collective",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Nom de la convention collective",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "getNextQuestion",
    description: "Retourne la prochaine question à soumettre à l'utilisateur",
    parameters: {
      type: "object",
      properties: {
        params: {
          type: "object",
          required: [],
          properties: {},
        },
      },
    },
  },
]

async function askChatGPT(messages = []) {
  if (!messages.length) {
    messages.push({ role: "system", content: SYSTEM_PROMPT })
  }
  console.log("---> CALL OF askChatGPT", messages)

  console.log("FUNCTION:", JSON.stringify(functions, null, 2))
  console.log("MESSAGES:", messages)

  const response = await openai.chat.completions.create({
    messages,
    model,
    functions,
  })

  const message = response.choices[0].message

  if (message.function_call) {
    const availableFunctions = { getNextQuestion, getIDCC }
    const functionName = message.function_call.name
    if (functionName === "getNextQuestion") {
      const functionToCall = availableFunctions[functionName]
      const functionArgs = JSON.parse(message.function_call.arguments)
      console.log("functionToCall", functionToCall)
      console.log("functionArgs", functionArgs)
      const { nextQuestion, missingVariable } = await functionToCall(
        functionArgs.params
      )
      functions[1].parameters.properties.params.properties[missingVariable] = {
        type: "string",
      }
      functions[1].parameters.properties.params.required.push(missingVariable)
      messages.push({
        role: "function",
        name: "getNextQuestion",
        content: nextQuestion,
      })
    } else {
      const functionToCall = availableFunctions[functionName]
      const functionArgs = JSON.parse(message.function_call.arguments)
      console.log("functionToCall", functionToCall)
      console.log("functionArgs", functionArgs)
      const idcc = await functionToCall(functionArgs.name)
      messages.push({ role: "function", name: "getIDCC", content: idcc })
    }
    const response2 = await openai.chat.completions.create({
      messages,
      model,
    })

    return response2.choices[0].message.content
  }

  return message.content
}

async function askUser(question = "") {
  console.log("---> CALL OF askUser")
  const response = await rl.question(`${question}\n`)
  return response
}

async function main() {
  // let chatgptMessage = ""
  const messages = []
  for (;;) {
    const chatgptMessage = await askChatGPT(messages)
    messages.push({ role: "assistant", content: chatgptMessage })
    const userAnswer = await askUser(chatgptMessage)
    messages.push({ role: "user", content: userAnswer })
  }
}

main()
