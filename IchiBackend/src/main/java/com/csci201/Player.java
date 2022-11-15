package com.csci201;
import java.util.ArrayList;
import java.util.List;

public class Player {
	private List<Card> playerCards = new ArrayList<>();
	
	private String username;
	
	public Player(String username) {
		this.username = username;
	}
	
	public String getUsername() {
		return username;
	}
	
	/**
	 * Adds a card to a player's hand. Should be calling deck.pop() to do so.
	 */
	public void addToHand(Card card) {
		playerCards.add(card);
	}
	
	public int handSize() {
		return playerCards.size();
	}
	
	public List<Card> getCards() {
		return playerCards;
	}
}
