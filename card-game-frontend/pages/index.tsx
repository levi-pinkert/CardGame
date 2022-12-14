import type { NextPage } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import styles from '../styles/Home.module.css'
import Game from '../components/Game'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ClientMessage, GameState, PlayerStatistics, ServerMessage, testGameStates } from '../utils/types'
import HomePage from '../components/HomePage'

import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator'

export interface AuthContextType {
  loggedIn: boolean;
  username: string;
  gameState: GameState | undefined;
  joinError: string | undefined;
  login: (newUsername: string, newPassword: string) => Promise<string>;
  logout: () => void;
  createAccount: (newUsername: string, newPassword: string) => Promise<string>;
  getStats: () => Promise<PlayerStatistics | undefined>;
  joinGame: (gameCode: string) => void;
  startGame: () => void;
  makeMove: (cardInfo: string[]) => void;
  draw: () => void;
  ichi: () => void;
  createGame: () => void;
  leaveGame: () => void;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);  //{} as AuthContextType tells typescript to ignore this. It's fine, we won't use the default value anyways.

import env from '../utils/env'
const gameEndpoint = env.gameEndpoint;

const makeGuestUsername = () => {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals]
  });
};

const Home: NextPage = () => {
  //State
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [username, setUsername] = useState<string>(makeGuestUsername());
  const [gameState, setGameState] = useState<GameState | undefined>(undefined);
  const [joinError, setJoinError] = useState<string | undefined>(undefined);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const messageQueueRef = useRef<ClientMessage[]>([]);

  //Load user info
  useEffect(() => {
    const loadedUsername = localStorage.getItem("username");
    if(loadedUsername == null){
      //leave values at defaults
    }else{
      setLoggedIn(true);
      setUsername(loadedUsername);
    }
  }, []);

  //Define functions
  const apiPost = async (endpoint: string, body: string) => {
    const response = await fetch(env.apiUrl + endpoint, {
      mode: 'cors',
      cache: 'no-cache',
      headers: {
        'Access-Control-Allow-Origin':'*'
      },
      method: 'POST',
      body: body
    })
    return await response.text();
  };

  const login = async (newUsername: string, newPassword: string) => {
    //TODO: validate newUsername and newPassword don't have spaces
    if(newUsername == "" || newPassword == ""){
      return "Please enter a username and password";
    }
    if(newUsername.indexOf(" ") != -1 || newPassword.indexOf(" ") != -1){
      return "Username and password cannot contain spaces";
    }
    const res = await apiPost("/login", newUsername + " " + newPassword);
    if(res == "Success"){
      setLoggedIn(true);
      setUsername(newUsername);
      localStorage.setItem("username", newUsername);
      return "";
    }
    return "Login failed -- check your username and password";
  }

  const logout = (): void => {
    if(loggedIn){
      setLoggedIn(false);
      setUsername(makeGuestUsername());
      localStorage.removeItem("username");
    }
  }

  const createAccount = async (newUsername: string, newPassword: string): Promise<string> => {
    if(newUsername == "" || newPassword == ""){
      return "Please enter a username and password";
    }
    if(newUsername.indexOf(" ") != -1 || newPassword.indexOf(" ") != -1){
      return "Username and password cannot contain spaces";
    }
    const res = await apiPost("/createAccount", newUsername + " " + newPassword);
    if(res == "Success"){
      setLoggedIn(true);
      setUsername(newUsername);
      localStorage.setItem("username", newUsername);
      return "";
    }
    return "Account creation failed. An account with that username may already exist.";
  }

  const getStats = async (): Promise<PlayerStatistics | undefined> => {
    const res = await apiPost('/get', username);
    console.log("plaintext res is", res);
    if(res == "Failure"){
      console.log("failed to get statistics for user", username);
      return undefined;
    }else{
      const stats: PlayerStatistics = JSON.parse(res);
      return stats;
    }
  }

  const connectWebSocket = () => {
    //If we're already connected, close that connection
    if(socketRef.current != undefined){
      console.log("Warning: Tried to make a new connection while already connected to a game.");
      socketRef.current.close();
      socketRef.current = undefined;
    }

    //Reset the queue of messages to send
    messageQueueRef.current = [];

    //Connect socket
    socketRef.current = new WebSocket(gameEndpoint);

    //Add open listener
    socketRef.current.addEventListener('open', () => {
      console.log("socket opened");
      messageQueueRef.current.forEach(sendMessage);
      messageQueueRef.current = [];
    });

    //Add message listener
    socketRef.current.addEventListener('message', (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      console.log("message received", msg);
      if(msg.error){
        console.log("Message from server:", msg.error);
      }
      if(msg.gameState){
        setGameState(msg.gameState);
        setJoinError(undefined);  //clear away any error saying we couldn't join
      }
    });

    //Add close listener
    socketRef.current.addEventListener('close', (event) => {
      console.log("socket closed");
      if(event.reason != ""){
        setJoinError(event.reason);
      }
      socketRef.current = undefined;
      messageQueueRef.current = [];
      setGameState(undefined);
    });

    //Add error listener
    socketRef.current.addEventListener('error', (event) => {
      console.log("Error: socket closed due to error");
      socketRef.current = undefined;
      messageQueueRef.current = [];
      setGameState(undefined);
    });
  }

  const sendMessage = (msg: ClientMessage) => {
    if(socketRef.current == undefined){
      console.log("Error: tried to send message, but socket is undefined.");
    }else if(socketRef.current.readyState != WebSocket.OPEN){
      console.log("Error: tried to send message, but socket wasn't open.");
    }else{
      console.log("seding message", msg);
      socketRef.current.send(JSON.stringify(msg));
    }
  }

  const queueMessage = (msg: ClientMessage) => {
    if(socketRef.current == undefined){
      console.log("Error: tried to send message, but socket is undefined.");
    }else if(socketRef.current.readyState == WebSocket.CONNECTING){
      messageQueueRef.current.push(msg);
    }else if(socketRef.current.readyState == WebSocket.OPEN){
      sendMessage(msg);
    }else{
      console.log("Error: tried to send message, but socked is closed.");
    }
  }

  const createGame = () => {
    //If we're already connected, don't proceed
    if(socketRef.current != undefined){
      console.log("Error: tried to create game while already connected to game.");
      return;
    }

    //Make the connection
    connectWebSocket();

    //Create the game
    if(socketRef.current == undefined){ return; }
    socketRef.current = socketRef.current as WebSocket; //this gets around incorrect TS warnings
    queueMessage({
      type: "createGame",
      username: username,
      stateId: -1,
      data: [],
      gameCode: undefined
    });
  }

  const joinGame = (gameCode: string) => {
    //If we're already connected, don't proceed
    if(socketRef.current != undefined){
      console.log("Error: tried to create game while already connected to game.");
      return;
    }

    //Clear the old error
    setJoinError(undefined);

    //Make the connection
    connectWebSocket();

    //Join the game
    if(socketRef.current == undefined){ return; }
    socketRef.current = socketRef.current as WebSocket; //this gets around incorrect TS warnings
    queueMessage({
      type: "joinGame",
      username: username,
      stateId: -1,
      data: [],
      gameCode: gameCode.toUpperCase()
    });
  }

  const startGame = () => {
    //Make sure we're connected to a game
    if(socketRef.current == undefined || gameState == undefined){
      console.log("Error: Not connected to a game.");
      return;
    }

    //Make the message
    queueMessage({
      type: "startGame",
      username: username,
      stateId: gameState.id,
      data: [],
      gameCode: gameState.gameCode
    });
  }

  const makeMove = (cardInfo: string[]) => {
    //Make sure we're connected to a game
    if(socketRef.current == undefined || gameState == undefined){
      console.log("Error: Not connected to a game.");
      return;
    }

    //Make the message
    queueMessage({
      type: "move",
      username: username,
      stateId: gameState.id,
      data: cardInfo,
      gameCode: gameState.gameCode
    });
  }

  const ichi = () => {
    //Make sure we're connected to a game
    if(socketRef.current == undefined || gameState == undefined){
      console.log("Error: Not connected to a game.");
      return;
    }

    //Make the message
    queueMessage({
      type: "ichi",
      username: username,
      stateId: gameState.id,
      data: [],
      gameCode: gameState.gameCode
    });
  }

  const draw = () => {
    //Make sure we're connected to a game
    if(socketRef.current == undefined || gameState == undefined){
      console.log("Error: Not connected to a game.");
      return;
    }

    //Make the message
    queueMessage({
      type: "draw",
      username: username,
      stateId: gameState.id,
      data: [],
      gameCode: gameState.gameCode
    });
  }
  
  const leaveGame = (): void => {
    //Make sure we're connected to a game
    if(socketRef.current == undefined || gameState == undefined){
      console.log("Error: Not connected to a game.");
      return;
    }

    //Close the socket
    socketRef.current.close();
  }

  //Construct the auth provider's value
  const authValue: AuthContextType = {
    loggedIn,
    username,
    gameState,
    joinError,
    login,
    logout,
    createAccount,
    getStats,
    joinGame,
    startGame,
    makeMove,
    draw,
    ichi,
    createGame,
    leaveGame
  }

  //Return the HTML
  return <AuthContext.Provider value={authValue}>
    {gameState == undefined ?
      <HomePage />
    :
      <div className={styles.gameContainer}>
        <Game />
      </div>
    }
  </AuthContext.Provider>;
}

export default Home;

export const useAuth = () => {
  return useContext(AuthContext);
}
